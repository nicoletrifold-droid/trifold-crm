import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
import type { MediaBlock } from "@trifold/ai"
import { logEvent } from "@web/lib/logger"

export const maxDuration = 60

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET — Webhook verification (Meta sends this to verify the endpoint)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// POST — Incoming message from WhatsApp
export async function POST(request: NextRequest) {
  // HMAC signature verification (Meta sends X-Hub-Signature-256)
  const appSecret = process.env.META_APP_SECRET
  const rawBody = await request.text()

  if (!appSecret) {
    console.error("META_APP_SECRET not configured — webhook blocked")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const signature = request.headers.get("x-hub-signature-256")
  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")

  if (signature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  // Parse the incoming webhook payload
  const entry = body.entry?.[0]
  const changes = entry?.changes?.[0]
  const value = changes?.value

  // --- Campaign status tracking (Story 15.12) ---
  const statuses = value?.statuses as Array<{ id: string; status: string; recipient_id: string }> | undefined
  if (statuses?.length) {
    try {
      const supabaseAdmin = getSupabaseAdmin()
      for (const st of statuses) {
        const recipientId = st.recipient_id
        // Normalize: remove 55 prefix if 13 digits
        const phone =
          recipientId.startsWith("55") && recipientId.length === 13
            ? recipientId.slice(2)
            : recipientId

        const waStatus = st.status // sent, delivered, read, failed

        // Find campaign entries for this phone that haven't reached terminal state
        const { data: entries } = await supabaseAdmin
          .from("campaign_entries")
          .select("id, campaign_id, org_id, whatsapp_status")
          .eq("phone", phone)
          .not("whatsapp_status", "in", "(read,failed)")

        for (const ce of entries ?? []) {
          const updates: Record<string, unknown> = { whatsapp_status: waStatus }
          if (waStatus === "delivered" || waStatus === "read") {
            updates.is_valid_phone = true
          } else if (waStatus === "failed") {
            updates.is_valid_phone = false
          }

          await supabaseAdmin
            .from("campaign_entries")
            .update(updates)
            .eq("id", ce.id)

          await supabaseAdmin.from("campaign_events").insert({
            org_id: ce.org_id,
            campaign_id: ce.campaign_id,
            entry_id: ce.id,
            channel: "whatsapp",
            event_type: waStatus,
            metadata: { wamid: st.id, recipient_id: recipientId },
          })
        }
      }
    } catch (statusError) {
      // Isolated — don't affect message processing
      logEvent({
        level: "error",
        category: "webhook",
        event_type: "CAMPAIGN_STATUS_TRACKING_ERROR",
        message: `Error tracking campaign WhatsApp statuses: ${statusError instanceof Error ? statusError.message : "Unknown"}`,
        source: "api/webhook/whatsapp",
      })
    }
  }

  // --- Message processing ---
  const messages = value?.messages

  if (!messages?.[0]) {
    return NextResponse.json({ status: "ok" })
  }

  const msg = messages[0]
  const from = msg.from as string
  const messageId = msg.id as string

  const supabase = getSupabaseAdmin()

  // Determine text, media block, and metadata based on message type
  let text: string = ""
  let mediaBlock: MediaBlock | undefined
  let mediaMetadata: { media_type?: string; media_url?: string } = {}
  let isVoiceMessage = false

  const IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/jpg",
  ])

  if (msg.type === "text") {
    text = msg.text?.body as string
  } else if (msg.type === "audio" || msg.type === "voice") {
    isVoiceMessage = true
    text = "[Mensagem de voz recebida]"
    mediaMetadata = { media_type: "voice" }
  } else if (msg.type === "image" || msg.type === "document") {
    // These will be handled after we have the config for auth
  } else {
    // Unsupported message type
    return NextResponse.json({ status: "ok" })
  }

  try {
    // Get org + whatsapp config
    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("org_id, phone_number_id, access_token, coexistence_enabled")
      .eq("status", "active")
      .single()

    if (!config) {
      console.error("No active WhatsApp config found")
      return NextResponse.json({ status: "ok" })
    }

    const orgId = config.org_id

    // Download media for image/document messages (needs access_token from config)
    if (msg.type === "image" && msg.image?.id) {
      try {
        const mediaRes = await fetch(
          `https://graph.facebook.com/v21.0/${msg.image.id}`,
          {
            headers: { Authorization: `Bearer ${config.access_token}` },
            signal: AbortSignal.timeout(10000),
          }
        )
        if (mediaRes.ok) {
          const mediaData = (await mediaRes.json()) as { url: string; mime_type?: string }
          const fileRes = await fetch(mediaData.url, {
            headers: { Authorization: `Bearer ${config.access_token}` },
            signal: AbortSignal.timeout(30000),
          })
          if (fileRes.ok) {
            const buffer = await fileRes.arrayBuffer()
            const base64 = Buffer.from(buffer).toString("base64")
            const mimeType = mediaData.mime_type || fileRes.headers.get("content-type") || "image/jpeg"
            mediaBlock = { type: "image", base64, mimeType }
            mediaMetadata = { media_type: "image" }
          }
        }
      } catch (err) {
        console.error("WhatsApp image download error:", err)
      }
      text = msg.image?.caption || "O que voce acha desta imagem?"
    }

    if (msg.type === "document" && msg.document?.id) {
      try {
        const mediaRes = await fetch(
          `https://graph.facebook.com/v21.0/${msg.document.id}`,
          {
            headers: { Authorization: `Bearer ${config.access_token}` },
            signal: AbortSignal.timeout(10000),
          }
        )
        if (mediaRes.ok) {
          const mediaData = (await mediaRes.json()) as { url: string; mime_type?: string }
          const fileRes = await fetch(mediaData.url, {
            headers: { Authorization: `Bearer ${config.access_token}` },
            signal: AbortSignal.timeout(30000),
          })
          if (fileRes.ok) {
            const buffer = await fileRes.arrayBuffer()
            const base64 = Buffer.from(buffer).toString("base64")
            const mimeType = mediaData.mime_type || fileRes.headers.get("content-type") || "application/octet-stream"
            if (IMAGE_MIME_TYPES.has(mimeType)) {
              mediaBlock = { type: "image", base64, mimeType }
              mediaMetadata = { media_type: "image" }
            } else if (mimeType === "application/pdf") {
              mediaBlock = { type: "document", base64, mimeType }
              mediaMetadata = { media_type: "document" }
            } else {
              mediaMetadata = { media_type: "document" }
            }
          }
        }
      } catch (err) {
        console.error("WhatsApp document download error:", err)
      }
      text = text || msg.document?.caption || "Recebi um documento."
    }

    // If no text content and no media, skip
    if (!text && !mediaBlock) {
      return NextResponse.json({ status: "ok" })
    }

    // Find or create lead
    let { data: lead } = await supabase
      .from("leads")
      .select("id, created_at, metadata")
      .eq("phone", from)
      .eq("org_id", orgId)
      .single()

    if (!lead) {
      // Get default stage (first one)
      const { data: defaultStage } = await supabase
        .from("kanban_stages")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_default", true)
        .single()

      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          org_id: orgId,
          phone: from,
          channel: "whatsapp",
          source: "whatsapp_organic",
          stage_id: defaultStage?.id,
        })
        .select("id, created_at")
        .single()

      lead = newLead as typeof lead
    }

    if (!lead) {
      console.error("Failed to find or create lead")
      return NextResponse.json({ status: "ok" })
    }

    // Check for Click-to-WhatsApp Ads referral data
    const referral = value?.messages?.[0]?.referral
    if (referral) {
      const referralData: Record<string, unknown> = {
        source_url: referral.source_url ?? null,
        source_id: referral.source_id ?? null,
        ctwa_clid: referral.ctwa_clid ?? null,
        headline: referral.headline ?? null,
        body: referral.body ?? null,
        media_type: referral.media_type ?? null,
      }

      // Resolve campaign name via meta_ads → meta_adsets → meta_campaigns (local lookup)
      let campaignName: string | null = referral.headline ?? null
      if (referral.source_id) {
        const { data: ad } = await supabase
          .from("meta_ads")
          .select("adset_id")
          .eq("meta_ad_id", referral.source_id)
          .eq("org_id", orgId)
          .single()

        if (ad?.adset_id) {
          const { data: adset } = await supabase
            .from("meta_adsets")
            .select("campaign_id")
            .eq("id", ad.adset_id)
            .single()

          if (adset?.campaign_id) {
            const { data: campaign } = await supabase
              .from("meta_campaigns")
              .select("name")
              .eq("id", adset.campaign_id)
              .single()

            if (campaign?.name) campaignName = campaign.name
          }
        }
      }

      // Calculate CTWA attribution window (72h from lead creation)
      const leadRef = lead as unknown as Record<string, unknown>
      const baseTime = leadRef.created_at
        ? new Date(leadRef.created_at as string).getTime()
        : Date.now()
      const ctwaWindowExpiresAt = new Date(baseTime + 72 * 60 * 60 * 1000).toISOString()

      // Merge with existing metadata (preserve other fields)
      const existingMeta = ((leadRef.metadata ?? {}) as Record<string, unknown>)

      await supabase
        .from("leads")
        .update({
          source: "whatsapp_click_to_ad",
          utm_source: "meta_ads",
          utm_medium: "whatsapp_ctwa",
          utm_campaign: campaignName,
          metadata: {
            ...existingMeta,
            referral: referralData,
            ctwa_window_expires_at: ctwaWindowExpiresAt,
          },
        })
        .eq("id", lead.id)
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, is_ai_active")
      .eq("lead_id", lead.id)
      .eq("status", "active")
      .single()

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          org_id: orgId,
          lead_id: lead.id,
          channel: "whatsapp",
          is_ai_active: true,
        })
        .select("id, is_ai_active")
        .single()

      conversation = newConv
    }

    if (!conversation) {
      console.error("Failed to find or create conversation")
      return NextResponse.json({ status: "ok" })
    }

    // Save incoming message
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      metadata: {
        whatsapp_message_id: messageId,
        ...mediaMetadata,
      },
    })

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id)

    // Handle voice/audio messages — reply asking lead to type
    if (isVoiceMessage) {
      const whatsappUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`
      await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: {
            body:
              "Oi! Recebi sua mensagem de voz, mas no momento nao consigo ouvir audios. " +
              "Pode digitar sua mensagem, por favor? Assim consigo te ajudar melhor!",
          },
        }),
      })
      return NextResponse.json({ status: "ok" })
    }

    // --- Campaign reply tracking (Story 15.12) ---
    try {
      const { data: campaignEntries } = await supabase
        .from("campaign_entries")
        .select("id, campaign_id, org_id")
        .eq("phone", from.startsWith("55") && from.length === 13 ? from.slice(2) : from)
        .eq("has_responded", false)

      for (const ce of campaignEntries ?? []) {
        await supabase
          .from("campaign_entries")
          .update({ has_responded: true })
          .eq("id", ce.id)

        await supabase.from("campaign_events").insert({
          org_id: ce.org_id,
          campaign_id: ce.campaign_id,
          entry_id: ce.id,
          channel: "whatsapp",
          event_type: "replied",
        })
      }
    } catch {
      // Isolated — don't affect message processing
    }

    // If AI is active, process with Nicole
    if (conversation.is_ai_active) {
      // Dynamic import to avoid loading AI module on every request
      const { processMessage, createAnthropicClient } = await import("@trifold/ai")

      const anthropic = createAnthropicClient()

      const response = await processMessage({
        supabase,
        anthropic,
        conversationId: conversation.id,
        message: text,
        orgId,
        mediaBlock,
        onEvent: (event) => logEvent({
          ...event,
          category: event.category as "bot" | "ai" | "webhook" | "auth" | "cron" | "system",
          source: "ai/pipeline",
          org_id: orgId,
          metadata: { ...event.metadata, conversation_id: conversation.id, lead_id: lead?.id },
        }),
      })

      // Send response via WhatsApp
      const whatsappUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`
      await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: response },
        }),
      })
    }

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    logEvent({
      level: "error",
      category: "webhook",
      event_type: "WEBHOOK_ERROR",
      message: `WhatsApp webhook error: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { error: error instanceof Error ? error.stack : String(error) },
      source: "api/webhook/whatsapp",
    })
    return NextResponse.json({ status: "ok" })
  }
}
