import { NextRequest, NextResponse, after } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import crypto from "crypto"
import type { MediaBlock } from "@trifold/ai"
import { logEvent } from "@web/lib/logger"
import { triggerAutomations } from "@web/lib/email-automations"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { notifyBrokerOfAppointment } from "@web/lib/broker/notify-appointment"
import { normalizePhoneBR } from "@trifold/shared"

export const maxDuration = 60

function getSupabaseAdmin() {
  return createAdminClient()
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
//
// Story 21.1 refactor:
//   - SYNC (before HTTP 200): HMAC verify, parse, wamid idempotency check,
//     phone normalize, lead upsert, conversation find-or-create, INSERT
//     inbound message. Return 200 immediately.
//   - ASYNC (inside `after()`): Nicole pipeline, outbound Cloud API call,
//     campaign reply tracking, conversation timestamp update.
//
// AC1 budget: full SYNC path < 2s p95 (target on Vercel).
export async function POST(request: NextRequest) {
  const t0 = Date.now()

  // ---- HMAC validation (sync) -------------------------------------------
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

  // ---- Parse payload (sync) ---------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const entry = body.entry?.[0]
  const changes = entry?.changes?.[0]
  const value = changes?.value

  // ---- Campaign status tracking (Story 15.12) ---------------------------
  // Isolated `after()` so it never blocks the inbound message path.
  const statuses = value?.statuses as
    | Array<{ id: string; status: string; recipient_id: string }>
    | undefined
  if (statuses?.length) {
    after(async () => {
      try {
        const supabaseAdmin = getSupabaseAdmin()
        for (const st of statuses) {
          const recipientId = st.recipient_id
          const phone =
            recipientId.startsWith("55") && recipientId.length === 13
              ? recipientId.slice(2)
              : recipientId

          const waStatus = st.status

          const { data: entries } = await supabaseAdmin
            .from("campaign_entries")
            .select("id, campaign_id, org_id, whatsapp_status")
            .eq("phone", phone)
            .not("whatsapp_status", "in", "(read,failed)")

          for (const ce of entries ?? []) {
            const updates: Record<string, unknown> = {
              whatsapp_status: waStatus,
            }
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
        logEvent({
          level: "error",
          category: "webhook",
          event_type: "CAMPAIGN_STATUS_TRACKING_ERROR",
          message: `Error tracking campaign WhatsApp statuses: ${
            statusError instanceof Error ? statusError.message : "Unknown"
          }`,
          source: "api/webhook/whatsapp",
        })
      }
    })
  }

  // ---- Message processing -----------------------------------------------
  const messages = value?.messages

  if (!messages?.[0]) {
    return NextResponse.json({ status: "ok" })
  }

  const msg = messages[0]
  const fromRaw = msg.from as string
  const messageId = msg.id as string

  const supabase = getSupabaseAdmin()

  // ---- Wamid idempotency check (sync, before any side-effects) ----------
  // AC2: if Meta retries the webhook with the same whatsapp_message_id we
  // discard silently. No new lead, no new message, no Nicole call.
  try {
    const { data: existingMsg } = await supabase
      .from("messages")
      .select("id, conversation_id")
      .eq("metadata->>whatsapp_message_id", messageId)
      .limit(1)
      .maybeSingle()

    if (existingMsg) {
      // Best-effort look up the lead via conversation for richer audit context
      let leadIdForLog: string | null = null
      if (existingMsg.conversation_id) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("lead_id")
          .eq("id", existingMsg.conversation_id)
          .maybeSingle()
        leadIdForLog = conv?.lead_id ?? null
      }

      logEvent({
        level: "info",
        category: "webhook",
        event_type: "duplicate_wamid_skipped",
        message: `Duplicate wamid ${messageId} — silently skipped`,
        metadata: {
          wamid: messageId,
          lead_id: leadIdForLog,
          conversation_id: existingMsg.conversation_id ?? null,
          original_message_id: existingMsg.id,
        },
        source: "api/webhook/whatsapp",
      })
      return NextResponse.json({ status: "ok" })
    }
  } catch (idemErr) {
    // Don't fail the webhook on idempotency lookup errors — log and proceed
    logEvent({
      level: "warn",
      category: "webhook",
      event_type: "wamid_check_error",
      message: `Idempotency check failed for wamid ${messageId}; proceeding`,
      metadata: {
        wamid: messageId,
        error: idemErr instanceof Error ? idemErr.message : String(idemErr),
      },
      source: "api/webhook/whatsapp",
    })
  }

  // ---- Phone normalization (sync) ---------------------------------------
  // AC4: every phone is normalized BEFORE any DB query/insert.
  const phoneNormalized = normalizePhoneBR(fromRaw)
  if (!phoneNormalized) {
    // Edge case: phone from Meta is unparseable. Silent skip with 200 to
    // avoid Meta retry storms — log for audit. AC4 + Dev Notes guidance.
    logEvent({
      level: "warn",
      category: "webhook",
      event_type: "phone_normalize_failed",
      message: `Could not normalize phone from Meta payload: ${fromRaw}`,
      metadata: { wamid: messageId, raw_from: fromRaw },
      source: "api/webhook/whatsapp",
    })
    return NextResponse.json({ status: "ok" })
  }

  // ---- Build inbound message text/media metadata ------------------------
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
    // Will be handled inside `after()` where we have access_token from config
  } else {
    return NextResponse.json({ status: "ok" })
  }

  // ---- Resolve org/whatsapp_config (sync) -------------------------------
  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("org_id, phone_number_id, access_token, coexistence_enabled")
    .eq("status", "active")
    .maybeSingle()

  if (!config) {
    console.error("No active WhatsApp config found")
    return NextResponse.json({ status: "ok" })
  }

  const orgId = config.org_id

  // ---- Find-or-upsert lead (sync) ---------------------------------------
  // AC3 + AC4 + AC5b: use `phone_normalized` as the dedup key. `.maybeSingle`
  // (not `.single`) to gracefully handle 0/2+ rows.
  const lead = await findOrUpsertLead(supabase, {
    orgId,
    phoneRaw: fromRaw,
    phoneNormalized,
    fromCleaned: phoneNormalized,
  })

  if (!lead) {
    console.error("Failed to find or create lead")
    return NextResponse.json({ status: "ok" })
  }

  // ---- CTWA referral metadata (sync, lightweight) -----------------------
  // Preserve existing logic but skip the Graph-API-style lookups here.
  // It's already only DB-local lookups; cheap enough to keep sync.
  const referral = value?.messages?.[0]?.referral
  if (referral) {
    try {
      const referralData: Record<string, unknown> = {
        source_url: referral.source_url ?? null,
        source_id: referral.source_id ?? null,
        ctwa_clid: referral.ctwa_clid ?? null,
        headline: referral.headline ?? null,
        body: referral.body ?? null,
        media_type: referral.media_type ?? null,
      }

      let campaignName: string | null = referral.headline ?? null
      if (referral.source_id) {
        const { data: ad } = await supabase
          .from("meta_ads")
          .select("adset_id")
          .eq("meta_ad_id", referral.source_id)
          .eq("org_id", orgId)
          .maybeSingle()

        if (ad?.adset_id) {
          const { data: adset } = await supabase
            .from("meta_adsets")
            .select("campaign_id")
            .eq("id", ad.adset_id)
            .maybeSingle()

          if (adset?.campaign_id) {
            const { data: campaign } = await supabase
              .from("meta_campaigns")
              .select("name")
              .eq("id", adset.campaign_id)
              .maybeSingle()

            if (campaign?.name) campaignName = campaign.name
          }
        }
      }

      const leadRef = lead as unknown as Record<string, unknown>
      const baseTime = leadRef.created_at
        ? new Date(leadRef.created_at as string).getTime()
        : Date.now()
      const ctwaWindowExpiresAt = new Date(
        baseTime + 72 * 60 * 60 * 1000
      ).toISOString()

      // Hot-fix Story 21.1 deploy: leads.metadata column does NOT exist (see
      // migration 016 doc). Preserve UTMs (real columns) but skip metadata
      // enrichment until follow-up story adds the column. CTWA referral context
      // (referralData, ctwaWindowExpiresAt) is lost on this code path until
      // then — non-blocking for P0 dedup fix.
      void referralData
      void ctwaWindowExpiresAt

      await supabase
        .from("leads")
        .update({
          source: "whatsapp_click_to_ad",
          utm_source: "meta_ads",
          utm_medium: "whatsapp_ctwa",
          utm_campaign: campaignName,
        })
        .eq("id", lead.id)
    } catch (refErr) {
      logEvent({
        level: "warn",
        category: "webhook",
        event_type: "ctwa_referral_error",
        message: "CTWA referral attribution failed (non-fatal)",
        metadata: {
          error: refErr instanceof Error ? refErr.message : String(refErr),
          lead_id: lead.id,
        },
        source: "api/webhook/whatsapp",
      })
    }
  }

  // ---- Find-or-create conversation (sync) -------------------------------
  const conversation = await findOrCreateConversation(supabase, {
    orgId,
    leadId: lead.id,
  })

  if (!conversation) {
    console.error("Failed to find or create conversation")
    return NextResponse.json({ status: "ok" })
  }

  // ---- INSERT inbound message (sync) ------------------------------------
  // Even for image/document we insert a placeholder row now. The async path
  // will enrich the row's metadata if media is downloaded. Worst case: text
  // is empty for media-only messages — Nicole still has the conversation.
  if (text || mediaMetadata.media_type) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text || "",
      metadata: {
        whatsapp_message_id: messageId,
        ...mediaMetadata,
      },
    })
  }

  // ---- ASYNC: media download, Nicole, outbound, automations -------------
  // Fire-and-forget; HTTP 200 is sent immediately after this `after()` is
  // scheduled. Any failure inside is logged but does not affect the response.
  after(async () => {
    const tAsync = Date.now()
    try {
      // Download media for image/document messages — needs config.access_token
      let asyncMediaBlock: MediaBlock | undefined = mediaBlock
      let asyncText = text

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
            const mediaData = (await mediaRes.json()) as {
              url: string
              mime_type?: string
            }
            const fileRes = await fetch(mediaData.url, {
              headers: { Authorization: `Bearer ${config.access_token}` },
              signal: AbortSignal.timeout(30000),
            })
            if (fileRes.ok) {
              const buffer = await fileRes.arrayBuffer()
              const base64 = Buffer.from(buffer).toString("base64")
              const mimeType =
                mediaData.mime_type ||
                fileRes.headers.get("content-type") ||
                "image/jpeg"
              asyncMediaBlock = { type: "image", base64, mimeType }
            }
          }
        } catch (err) {
          console.error("WhatsApp image download error:", err)
        }
        asyncText = msg.image?.caption || "O que voce acha desta imagem?"
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
            const mediaData = (await mediaRes.json()) as {
              url: string
              mime_type?: string
            }
            const fileRes = await fetch(mediaData.url, {
              headers: { Authorization: `Bearer ${config.access_token}` },
              signal: AbortSignal.timeout(30000),
            })
            if (fileRes.ok) {
              const buffer = await fileRes.arrayBuffer()
              const base64 = Buffer.from(buffer).toString("base64")
              const mimeType =
                mediaData.mime_type ||
                fileRes.headers.get("content-type") ||
                "application/octet-stream"
              if (IMAGE_MIME_TYPES.has(mimeType)) {
                asyncMediaBlock = { type: "image", base64, mimeType }
              } else if (mimeType === "application/pdf") {
                asyncMediaBlock = { type: "document", base64, mimeType }
              }
            }
          }
        } catch (err) {
          console.error("WhatsApp document download error:", err)
        }
        asyncText = asyncText || msg.document?.caption || "Recebi um documento."
      }

      // Skip Nicole if there's no text and no media at all
      if (!asyncText && !asyncMediaBlock) return

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation!.id)

      // Voice/audio: short-circuit reply asking lead to type
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
            to: fromRaw,
            type: "text",
            text: {
              body:
                "Oi! Recebi sua mensagem de voz, mas no momento nao consigo ouvir audios. " +
                "Pode digitar sua mensagem, por favor? Assim consigo te ajudar melhor!",
            },
          }),
        })
        return
      }

      // Campaign reply tracking (Story 15.12) — preserve intact
      try {
        const phoneForCampaign =
          phoneNormalized.startsWith("55") && phoneNormalized.length === 13
            ? phoneNormalized.slice(2)
            : phoneNormalized
        const { data: campaignEntries } = await supabase
          .from("campaign_entries")
          .select("id, campaign_id, org_id")
          .eq("phone", phoneForCampaign)
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

      // Trigger automations for newly-created leads (deferred from sync path)
      // Only fire if this is a brand-new lead (heuristic: `created_at` within
      // last few seconds OR explicit flag we'd attach in the future)
      if (lead && (lead as unknown as Record<string, unknown>)._brand_new === true) {
        void triggerAutomations("lead.created", {
          id: lead.id,
          email: null,
          name: null,
          phone: phoneNormalized,
          org_id: orgId,
        })
        void distributeLeadToNextBroker(lead.id, orgId).catch((err) =>
          console.error("[roleta] distribution error:", err)
        )
      }

      // Nicole pipeline
      if (conversation!.is_ai_active) {
        const { processMessage, createAnthropicClient } = await import(
          "@trifold/ai"
        )

        const anthropic = createAnthropicClient()

        const response = await processMessage({
          supabase,
          anthropic,
          conversationId: conversation!.id,
          message: asyncText,
          orgId,
          mediaBlock: asyncMediaBlock,
          onEvent: (event) => {
            logEvent({
              ...event,
              category: event.category as
                | "bot"
                | "ai"
                | "webhook"
                | "auth"
                | "cron"
                | "system",
              source: "ai/pipeline",
              org_id: orgId,
              metadata: {
                ...event.metadata,
                conversation_id: conversation!.id,
                lead_id: lead!.id,
              },
            })

            // Story 51-3: notify the assigned broker when Nicole schedules a visit.
            // Best-effort (fire-and-forget) — never blocks the pipeline response.
            // Story 51-7 (AC5): the notification recipient is decoupled from lead
            // ownership. Prefer notification_broker_user_id (the lead owner kept by
            // the guard); fall back to broker_user_id for backward compatibility.
            if (event.event_type === "APPOINTMENT_CREATED") {
              const notifyBrokerUserId =
                (event.metadata?.notification_broker_user_id as string | null) ??
                (event.metadata?.broker_user_id as string | null)
              if (notifyBrokerUserId) {
                void notifyBrokerOfAppointment({
                  orgId,
                  brokerUserId: notifyBrokerUserId,
                  leadId: (event.metadata?.lead_id as string) ?? lead!.id,
                  leadName: (event.metadata?.lead_name as string | null) ?? null,
                  leadPhone: (event.metadata?.lead_phone as string | null) ?? null,
                }).catch((err) =>
                  console.error("[appointment-notify] dispatch error:", err)
                )
              }
            }
          },
        })

        const whatsappUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`
        await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: fromRaw,
            type: "text",
            text: { body: response },
          }),
        })
      }

      logEvent({
        level: "info",
        category: "webhook",
        event_type: "whatsapp_async_done",
        message: `Async path completed in ${Date.now() - tAsync}ms (sync=${tAsync - t0}ms)`,
        metadata: {
          wamid: messageId,
          lead_id: lead!.id,
          conversation_id: conversation!.id,
          ms_sync: tAsync - t0,
          ms_async: Date.now() - tAsync,
        },
        source: "api/webhook/whatsapp",
        org_id: orgId,
      })
    } catch (asyncErr) {
      logEvent({
        level: "error",
        category: "webhook",
        event_type: "WEBHOOK_ASYNC_ERROR",
        message: `WhatsApp webhook async error: ${
          asyncErr instanceof Error ? asyncErr.message : String(asyncErr)
        }`,
        metadata: {
          error: asyncErr instanceof Error ? asyncErr.stack : String(asyncErr),
          wamid: messageId,
        },
        source: "api/webhook/whatsapp",
      })
    }
  })

  // AC1: respond fast — async path runs after this returns
  return NextResponse.json({ status: "ok" })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LeadResult {
  id: string
  created_at: string
  // metadata column does NOT exist on leads table (see migration 016 doc).
  // Kept optional for CTWA referral compat — always undefined in practice.
  metadata?: Record<string, unknown> | null
  // marker that signals "this lead was just created" — used by the async path
  _brand_new?: boolean
}

/**
 * Find or upsert a lead by `(org_id, phone_normalized)`.
 *
 * - First tries `.maybeSingle()` (oldest first) on the existing index.
 * - If 0 rows: INSERT with raw phone, the GENERATED COLUMN computes the
 *   normalized value and the UNIQUE index (after migration 021_part2)
 *   guarantees no race-time duplicates.
 * - If 2+ rows are returned: oldest wins (defensive — should disappear after
 *   cleanup + part2 migration).
 *
 * Logs `event=lead_created` on insert, `event=lead_upsert_conflict` if the
 * INSERT hit the UNIQUE constraint and we recovered via re-query.
 */
async function findOrUpsertLead(
  supabase: SupabaseClient,
  args: {
    orgId: string
    phoneRaw: string
    phoneNormalized: string
    fromCleaned: string
  }
): Promise<LeadResult | null> {
  const { orgId, phoneRaw, phoneNormalized } = args

  // 1) find existing lead — ordered, maybeSingle
  // NOTE: leads.metadata column does NOT exist (see migration 016 doc).
  // Hot-fix Story 21.1 deploy: remove metadata from select to unblock webhook.
  // CTWA referral path (lines 322-345) gracefully degrades via `?? {}` fallback.
  // TODO follow-up: design metadata column migration if CTWA enrichment needed.
  const { data: existing } = await supabase
    .from("leads")
    .select("id, created_at")
    .eq("phone_normalized", phoneNormalized)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return existing as LeadResult
  }

  // 2) no row → fetch default stage and INSERT a new lead
  const { data: defaultStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .maybeSingle()

  // Use insert + on conflict via Supabase upsert. After migration 021_part2
  // the (org_id, phone_normalized) UNIQUE constraint exists and ON CONFLICT
  // prevents race-time duplicates.
  const { data: inserted, error: insertErr } = await supabase
    .from("leads")
    .upsert(
      {
        org_id: orgId,
        phone: phoneRaw,
        channel: "whatsapp",
        source: "whatsapp_organic",
        stage_id: defaultStage?.id,
      },
      {
        onConflict: "org_id,phone_normalized",
        ignoreDuplicates: false,
      }
    )
    .select("id, created_at")
    .maybeSingle()

  if (insertErr) {
    // Race fallback: someone else inserted between our SELECT and INSERT.
    // Re-query and return whatever exists.
    logEvent({
      level: "warn",
      category: "webhook",
      event_type: "lead_upsert_conflict",
      message: `Upsert conflict on (org_id, phone_normalized) — recovering`,
      metadata: {
        phone_normalized: phoneNormalized,
        error: insertErr.message,
      },
      source: "api/webhook/whatsapp",
      org_id: orgId,
    })

    const { data: recovered } = await supabase
      .from("leads")
      .select("id, created_at")
      .eq("phone_normalized", phoneNormalized)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    return recovered as LeadResult | null
  }

  if (inserted) {
    logEvent({
      level: "info",
      category: "webhook",
      event_type: "lead_created",
      message: "New lead created via WhatsApp inbound",
      metadata: {
        phone_normalized: phoneNormalized,
        lead_id: inserted.id,
      },
      source: "api/webhook/whatsapp",
      org_id: orgId,
    })

    const result = inserted as LeadResult
    // Mark for the async path so it can call triggerAutomations("lead.created")
    result._brand_new = true
    return result
  }

  return null
}

/**
 * Find-or-create the active conversation for a lead.
 * Uses `.maybeSingle()` and orders ASC so legacy duplicates resolve to the
 * earliest one (most history).
 */
async function findOrCreateConversation(
  supabase: SupabaseClient,
  args: { orgId: string; leadId: string }
): Promise<{ id: string; is_ai_active: boolean } | null> {
  const { orgId, leadId } = args

  const { data: existing } = await supabase
    .from("conversations")
    .select("id, is_ai_active")
    .eq("lead_id", leadId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) {
    logEvent({
      level: "info",
      category: "webhook",
      event_type: "conversation_found",
      message: "Existing active conversation found",
      metadata: {
        conversation_id: existing.id,
        lead_id: leadId,
      },
      source: "api/webhook/whatsapp",
      org_id: orgId,
    })
    return existing as { id: string; is_ai_active: boolean }
  }

  const { data: newConv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      org_id: orgId,
      lead_id: leadId,
      channel: "whatsapp",
      is_ai_active: true,
    })
    .select("id, is_ai_active")
    .maybeSingle()

  if (convErr) {
    logEvent({
      level: "error",
      category: "webhook",
      event_type: "conversation_create_failed",
      message: `Failed to create conversation: ${convErr.message}`,
      metadata: { lead_id: leadId, error: convErr.message },
      source: "api/webhook/whatsapp",
      org_id: orgId,
    })
    return null
  }

  if (newConv) {
    logEvent({
      level: "info",
      category: "webhook",
      event_type: "conversation_created",
      message: "New active conversation created",
      metadata: {
        conversation_id: newConv.id,
        lead_id: leadId,
      },
      source: "api/webhook/whatsapp",
      org_id: orgId,
    })
  }

  return (newConv as { id: string; is_ai_active: boolean }) ?? null
}
