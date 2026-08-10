import { NextRequest, NextResponse, after } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import crypto from "crypto"
import type { MediaBlock } from "@trifold/ai"
import { logEvent } from "@web/lib/logger"
import { triggerAutomations } from "@web/lib/email-automations"
import { notifyBrokerOfAppointment } from "@web/lib/broker/notify-appointment"
import { notifyBrokerOnReply } from "@web/lib/broker/notify-on-reply"
import {
  shouldReactivateAi,
  resolveTakeoverAnchor,
} from "@web/lib/broker/broker-takeover-status"
import { normalizePhoneBR } from "@trifold/shared"
import type { WhatsAppReferral } from "@trifold/shared"
import { buildCtwaMetadata } from "@web/app/api/webhook/whatsapp/ctwa-metadata"
import {
  sendLibraryMediaIfRequested,
  resolveSendableMedia,
  reconcileMediaWithResponse,
} from "@web/lib/ai/send-library-media"
import { maybeRouteInboundToRelationship } from "@web/lib/relacionamento/route-inbound"
import { transcribeAudio } from "@web/lib/transcription/transcribe"
import { uploadInboundMedia } from "@web/lib/media/inbound-media"
import { sendWhatsAppTypingIndicator } from "@web/lib/whatsapp/send-typing-indicator"
import { calculateTypingDelay } from "@web/lib/whatsapp/typing-delay"
import {
  alertCredencialMorta,
  isCredencialMorta,
} from "@web/lib/meta/alert-credencial-morta"

export const maxDuration = 60

function getSupabaseAdmin() {
  return createAdminClient()
}

// Story 75-85 — sobe a mídia recebida (imagem/documento) ao bucket público e grava
// media_url na mensagem do lead (achada pelo whatsapp_message_id). DEFENSIVO: qualquer
// falha é logada e ignorada — NUNCA quebra o fluxo de inbound/IA.
/**
 * Story 75-289 (AC4) — mescla um patch no `messages.metadata` da mensagem do wamid.
 *
 * PostgREST não faz merge de jsonb: passar `metadata: {...}` SUBSTITUI o objeto
 * inteiro. Era assim que o `media_id` recém-gravado se perdia no update de
 * sucesso do download. Lê-modifica-escreve mantém o que já estava lá.
 */
async function mergeMessageMetadata(
  admin: SupabaseClient,
  wamid: string,
  patch: Record<string, unknown>,
  columns: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { data: row } = await admin
      .from("messages")
      .select("metadata")
      .eq("metadata->>whatsapp_message_id", wamid)
      .maybeSingle()
    const current = (row?.metadata as Record<string, unknown> | null) ?? {}
    await admin
      .from("messages")
      .update({ ...columns, metadata: { ...current, ...patch } })
      .eq("metadata->>whatsapp_message_id", wamid)
  } catch (e) {
    console.error("[75-289] mergeMessageMetadata falhou (ignorado):", e)
  }
}

/**
 * Story 75-289 (AC4) — registra que a mídia NÃO baixou.
 *
 * Antes o download vivia dentro de `if (mediaRes.ok)` sem `else`: token morto =
 * mídia perdida sem rastro, e a bolha ficava eternamente "sem arquivo". Com o
 * `media_id` persistido + esta marca, a UI mostra "mídia não baixada" e o
 * download pode ser tentado de novo (a Meta retém a mídia ~30 dias).
 */
async function markMediaDownloadFailed(
  admin: SupabaseClient,
  wamid: string,
  reason: string,
  orgId?: string
): Promise<void> {
  console.error(`[75-289] download de mídia falhou (${reason}) — wamid ${wamid}`)
  await mergeMessageMetadata(admin, wamid, {
    media_download_failed: true,
    media_download_error: reason,
  })
  // Story 75-289 (AC3): 401 aqui é a MESMA credencial que o envio usa. Avisa o
  // gestor (1x/dia, coalescido) — foi este caminho que perdeu 2 áudios em 10/08.
  if (orgId && isCredencialMorta({ error: reason })) {
    await alertCredencialMorta({
      orgId,
      credencial: "whatsapp_config",
      detalhe: `download de mídia recebida falhou: ${reason}`,
    })
  }
}

async function persistInboundMedia(
  admin: SupabaseClient,
  buffer: ArrayBuffer,
  mimeType: string,
  mediaType: "image" | "document",
  leadId: string,
  wamid: string
): Promise<void> {
  try {
    const ext = (mimeType.split("/")[1] || "bin").split(";")[0]
    const path = `whatsapp-inbound/${leadId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from("nicole-media")
      .upload(path, Buffer.from(buffer), { contentType: mimeType, upsert: false })
    if (upErr) {
      console.error("[75-85] upload de mídia recebida falhou (ignorado):", upErr.message)
      return
    }
    const { data: pub } = admin.storage.from("nicole-media").getPublicUrl(path)
    // Story 75-222: grava TAMBÉM nas colunas top-level (media_url/media_type) — a UI
    // renderiza a partir delas. metadata continua preenchido por compat (telas antigas).
    // Story 75-289 (AC4): via merge, para não apagar o `media_id`; e limpa a marca de
    // falha caso este seja um download que deu certo numa segunda tentativa.
    await mergeMessageMetadata(
      admin,
      wamid,
      {
        whatsapp_message_id: wamid,
        media_type: mediaType,
        media_url: pub.publicUrl,
        media_download_failed: false,
      },
      { media_url: pub.publicUrl, media_type: mediaType }
    )
  } catch (e) {
    console.error("[75-85] persistInboundMedia erro (ignorado):", e)
  }
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
  // Story 75-289 (AC4): `media_id` passa a ser PERSISTIDO. Em 10/08 o token morreu,
  // o download falhou e 2 mensagens de voz de um lead em etapa SDR foram perdidas
  // para sempre — a Meta retém a mídia ~30 dias, mas o id só existia neste payload
  // (o metadata guardava apenas wamid + media_type, e este webhook, ao contrário do
  // de meta_ads, não grava payload em webhook_logs). Com o id no banco, mídia que
  // não baixou fica recuperável.
  let mediaMetadata: {
    media_type?: string
    media_url?: string
    media_id?: string
    media_download_failed?: boolean
  } = {}
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
    mediaMetadata = { media_type: "voice", media_id: msg.audio?.id ?? msg.voice?.id }
  } else if (msg.type === "image" || msg.type === "document") {
    // Story 75-85: marca o tipo já no sync → a mensagem do lead é inserida (cria a
    // bolha mesmo sem legenda). A URL (media_url) é gravada no async, após baixar e
    // subir a mídia ao bucket. (access_token só existe dentro do after().)
    mediaMetadata = {
      media_type: msg.type,
      media_id: msg.type === "image" ? msg.image?.id : msg.document?.id,
    }
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

  // ---- Enrich lead from campaign_entries (name + campaign context) ------
  // When a campaign participant replies, populate their registered name and
  // campaign origin so brokers see proper info in the pipeline card.
  try {
    const phoneForLookup =
      phoneNormalized.startsWith("55") && phoneNormalized.length === 13
        ? phoneNormalized.slice(2)
        : phoneNormalized

    const { data: campaignEntry } = await supabase
      .from("campaign_entries")
      .select("name, campaigns!campaign_id(name)")
      .eq("phone", phoneForLookup)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (campaignEntry?.name) {
      const campaignName =
        (campaignEntry.campaigns as { name?: string } | null)?.name ?? null

      const { data: currentLead } = await supabase
        .from("leads")
        .select("name")
        .eq("id", lead.id)
        .maybeSingle()

      const enrichUpdates: Record<string, unknown> = {
        utm_campaign: campaignName,
      }
      if (!currentLead?.name) {
        enrichUpdates.name = campaignEntry.name
      }

      await supabase.from("leads").update(enrichUpdates).eq("id", lead.id)
    }
  } catch {
    // Non-fatal — don't block message processing
  }

  // ---- CTWA referral metadata (sync, lightweight) -----------------------
  // Preserve existing logic but skip the Graph-API-style lookups here.
  // It's already only DB-local lookups; cheap enough to keep sync.
  const referral = value?.messages?.[0]?.referral as
    | WhatsAppReferral
    | undefined
  if (referral) {
    try {
      // Story 50-3: CTWA referral persisted in leads.metadata (Epic 50).
      // ad_id (= referral.source_id) é a chave consumida pelo CreativeChip
      // (Story 50-2). Em re-engajamento, preservamos o ad_id original (AC3).
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
      const baseTimestampMs = leadRef.created_at
        ? new Date(leadRef.created_at as string).getTime()
        : Date.now()

      // Re-engajamento: preservar ad_id original (mesma lógica que o webhook
      // Meta usa em meta-ads/route.ts:201-209 para utm_campaign). Ler o
      // metadata atual antes do merge para não sobrescrever atribuição prévia.
      const { data: currentLead } = await supabase
        .from("leads")
        .select("metadata")
        .eq("id", lead.id)
        .maybeSingle()

      const mergedMetadata = buildCtwaMetadata({
        currentMetadata: currentLead?.metadata as
          | Record<string, unknown>
          | null
          | undefined,
        referral,
        baseTimestampMs,
      })

      await supabase
        .from("leads")
        .update({
          source: "whatsapp_click_to_ad",
          utm_source: "meta_ads",
          utm_medium: "whatsapp_ctwa",
          utm_campaign: campaignName,
          metadata: mergedMetadata,
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
    const { error: insertErr } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text || "",
      // Story 75-222: colunas top-level já no sync (a URL chega no async, após o
      // download; o tipo garante a bolha de mídia mesmo antes do upload terminar).
      media_type: mediaMetadata.media_type ?? null,
      media_url: mediaMetadata.media_url ?? null,
      metadata: {
        whatsapp_message_id: messageId,
        ...mediaMetadata,
      },
    })

    // Unique constraint violation (PG 23505) = duplicate wamid that slipped
    // past the application-level check due to a race condition. Discard
    // silently — returning here prevents the after() block (Nicole) from
    // being scheduled for this duplicate request.
    if (insertErr?.code === "23505") {
      logEvent({
        level: "info",
        category: "webhook",
        event_type: "duplicate_wamid_skipped",
        message: `Duplicate wamid ${messageId} caught at INSERT — race condition discarded`,
        metadata: { wamid: messageId, conversation_id: conversation.id },
        source: "api/webhook/whatsapp",
      })
      return NextResponse.json({ status: "ok" })
    }

    // Story 63-12 — push ao corretor quando o lead responde. `after()` dedicado
    // e independente do bloco da Nicole (abaixo): uma falha no push não afeta o
    // pipeline e vice-versa. O gate (corretor já assumiu) + Q3 (sem corretor →
    // nada) vivem dentro do helper. Fire-and-forget: não bloqueia o HTTP 200.
    // Vem APÓS o early-return de wamid duplicado (23505): uma reentrega não
    // dispara push repetido ao corretor.
    after(async () => {
      await notifyBrokerOnReply({
        supabase: getSupabaseAdmin(),
        leadId: lead.id,
        conversationId: conversation.id,
        orgId,
        messageExcerpt: text ?? "",
      })
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
      // Transcrição do áudio (quando for mensagem de voz). Preenchido no branch de áudio
      // abaixo; se OK, a Nicole responde ao conteúdo; se null, cai no fallback "digite".
      let transcription: string | null = null

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
              // Story 75-85: persiste a imagem no bucket + grava media_url na mensagem.
              await persistInboundMedia(getSupabaseAdmin(), buffer, mimeType, "image", lead.id, messageId)
            } else {
              // Story 75-289 (AC4): antes este ramo não existia — falha sem rastro.
              await markMediaDownloadFailed(getSupabaseAdmin(), messageId, `arquivo HTTP ${fileRes.status}`, orgId)
            }
          } else {
            await markMediaDownloadFailed(getSupabaseAdmin(), messageId, `graph HTTP ${mediaRes.status}`, orgId)
          }
        } catch (err) {
          console.error("WhatsApp image download error:", err)
          await markMediaDownloadFailed(
            getSupabaseAdmin(),
            messageId,
            err instanceof Error ? err.message : "erro desconhecido",
            orgId
          )
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
              // Story 75-85: persiste o anexo no bucket + grava media_url na mensagem.
              const mt = IMAGE_MIME_TYPES.has(mimeType) ? "image" : "document"
              await persistInboundMedia(getSupabaseAdmin(), buffer, mimeType, mt, lead.id, messageId)
            } else {
              // Story 75-289 (AC4)
              await markMediaDownloadFailed(getSupabaseAdmin(), messageId, `arquivo HTTP ${fileRes.status}`, orgId)
            }
          } else {
            await markMediaDownloadFailed(getSupabaseAdmin(), messageId, `graph HTTP ${mediaRes.status}`, orgId)
          }
        } catch (err) {
          console.error("WhatsApp document download error:", err)
          await markMediaDownloadFailed(
            getSupabaseAdmin(),
            messageId,
            err instanceof Error ? err.message : "erro desconhecido",
            orgId
          )
        }
        asyncText = asyncText || msg.document?.caption || "Recebi um documento."
      }

      // Voz/áudio: baixa o arquivo → (1) salva no bucket p/ o player e (2) transcreve.
      // A transcrição vira o CONTEÚDO da mensagem (todos leem, inclusive iPhone/Safari)
      // e alimenta a Nicole. O áudio original fica disponível pra quem quiser ouvir.
      const audioId: string | undefined = msg.audio?.id ?? msg.voice?.id
      if ((msg.type === "audio" || msg.type === "voice") && audioId) {
        try {
          const mediaRes = await fetch(
            `https://graph.facebook.com/v21.0/${audioId}`,
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
              const mimeType =
                mediaData.mime_type || fileRes.headers.get("content-type") || "audio/ogg"
              // (1) salva o áudio → media_url p/ o player
              const mediaUrl = await uploadInboundMedia(getSupabaseAdmin(), buffer, mimeType, lead.id)
              // (2) transcreve (texto p/ todos + Nicole)
              transcription = await transcribeAudio(buffer, mimeType)
              // (3) atualiza a mensagem do lead: conteúdo = transcrição; metadata = voz + url
              // Story 75-289 (AC4): via merge — o update direto substituía o metadata
              // inteiro e apagava o `media_id` gravado no sync.
              await mergeMessageMetadata(
                getSupabaseAdmin(),
                messageId,
                {
                  whatsapp_message_id: messageId,
                  media_type: "voice",
                  media_url: mediaUrl,
                  transcribed: !!transcription,
                  media_download_failed: false,
                },
                {
                  content: transcription || "[Mensagem de voz recebida]",
                  // Story 75-222: colunas top-level = fonte canônica p/ a UI.
                  media_url: mediaUrl,
                  media_type: "voice",
                }
              )
              // (4) alimenta a Nicole com a transcrição (se houve)
              if (transcription) asyncText = transcription
            } else {
              // Story 75-289 (AC4): era exatamente aqui que os 2 áudios de 10/08
              // desapareciam — sem `else`, sem log, sem rastro.
              await markMediaDownloadFailed(getSupabaseAdmin(), messageId, `arquivo HTTP ${fileRes.status}`, orgId)
            }
          } else {
            await markMediaDownloadFailed(getSupabaseAdmin(), messageId, `graph HTTP ${mediaRes.status}`, orgId)
          }
        } catch (err) {
          console.error("WhatsApp audio download/transcribe error:", err)
          await markMediaDownloadFailed(
            getSupabaseAdmin(),
            messageId,
            err instanceof Error ? err.message : "erro desconhecido",
            orgId
          )
        }
      }

      // Skip Nicole if there's no text and no media at all
      if (!asyncText && !asyncMediaBlock) return

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation!.id)

      // Voz/áudio SEM transcrição (Whisper falhou/sem chave): fallback — pede pra digitar.
      // Com transcrição, a Nicole segue o fluxo normal respondendo ao conteúdo do áudio.
      if (isVoiceMessage && !transcription) {
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

        // NÃO distribuímos na primeira mensagem (Story 71-1). A Nicole conduz a
        // conversa; o cron `roleta-retry` distribui só depois que a conversa
        // esfria (≥5 min sem nova mensagem do lead), classificando o diálogo
        // inteiro — evita distribuir um "Olá" que vira "vaga de emprego".
      }

      // Story 63-13 — Reativação automática da Nicole após 24h de inatividade do
      // corretor. Só executa quando is_ai_active=false (corretor assumiu via
      // handoff explícito). Busca a última msg `role='broker'` da conversa; se não
      // existe OU foi há ≥ 24h (`shouldReactivateAi` / `BROKER_WINDOW_MS`), a Nicole
      // reassume (is_ai_active=true). Se o corretor enviou < 24h, mantém false →
      // Nicole silente. Escopo por-conversa (`.eq("id", conversation.id)`). Idempotente:
      // o guard `!isAiActive` evita query/UPDATE quando a Nicole já está ativa.
      // `supabase` aqui é admin client (getSupabaseAdmin, L155) — sem RLS no UPDATE.
      // Race (R1): se o webhook leu is_ai_active=true antes do send-message desligar,
      // pior caso a Nicole responde 1x a mais — a próxima msg do lead já verá false.
      let isAiActive = conversation!.is_ai_active
      if (!isAiActive) {
        // Story 63-15 — âncora do handoff = MAIS RECENTE entre `handoff_at` (handoff
        // por envio do corretor OU por agendamento da Nicole) e a última msg
        // `role='broker'`. Sem isso, um handoff por agendamento (lastBrokerAt=null)
        // reativaria a Nicole na mensagem seguinte e anularia o handoff.
        const [{ data: convRow }, { data: lastBrokerMsg }] = await Promise.all([
          supabase
            .from("conversations")
            .select("handoff_at")
            .eq("id", conversation!.id)
            .maybeSingle(),
          supabase
            .from("messages")
            .select("created_at")
            .eq("conversation_id", conversation!.id)
            .eq("role", "broker")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        const anchor = resolveTakeoverAnchor(
          convRow?.handoff_at ?? null,
          lastBrokerMsg?.created_at ?? null
        )

        if (shouldReactivateAi(anchor)) {
          // Reassume: limpa o handoff para não influenciar cálculos futuros.
          await supabase
            .from("conversations")
            .update({ is_ai_active: true, handoff_at: null, handoff_reason: null })
            .eq("id", conversation!.id)
          isAiActive = true
        }
      }

      // Story 76-2 — Cliente da base de obras? Se a Nicole identificar (alta confiança
      // por telefone) que quem escreveu já é nosso cliente, a conversa vira RELACIONAMENTO:
      // sai do funil de leads, a Nicole para de responder (handoff) e a Samara assume pelo
      // módulo Chat. Roda só enquanto a conversa não foi classificada (relationship_checked).
      if (isAiActive) {
        const handledAsRelationship = await maybeRouteInboundToRelationship(supabase, {
          conversationId: conversation!.id,
          leadId: lead!.id,
          orgId,
          phone: phoneNormalized,
          name: null, // 76-2 é só por telefone; nome (76-3) entra depois
          fromRaw,
          waConfig: {
            phone_number_id: config.phone_number_id,
            access_token: config.access_token,
          },
        })
        if (handledAsRelationship) isAiActive = false
      }

      // Nicole pipeline
      if (isAiActive) {
        // Story 75-156 — humanização: mostra "digitando…" no WhatsApp do lead
        // enquanto a Nicole pensa. Fire-and-forget (nunca bloqueia/lança); a Meta
        // exige o wamid inbound e também marca a mensagem como lida (✓✓).
        void sendWhatsAppTypingIndicator(config, messageId)

        const { processMessage, createAnthropicClient } = await import(
          "@trifold/ai"
        )
        // Story 73-1: injeta o push pro Google Calendar (mantém packages/ai desacoplado).
        const { createCalendarEvent, deleteCalendarEvent } = await import("@web/lib/google-calendar")

        const anthropic = createAnthropicClient()

        // Story 75-157 — resolve ANTES da fala o que realmente dá para enviar,
        // para a Nicole não prometer imagem que não vai sair. A MESMA resolução é
        // reaproveitada no envio real (abaixo), evitando fala e envio divergirem.
        const sendableMedia = await resolveSendableMedia(supabase, {
          orgId,
          leadId: lead!.id,
          conversationId: conversation!.id,
          text: asyncText,
        })

        const response = await processMessage({
          supabase,
          anthropic,
          conversationId: conversation!.id,
          message: asyncText,
          orgId,
          mediaBlock: asyncMediaBlock,
          createCalendarEvent,
          deleteCalendarEvent,
          mediaContext: {
            requested: sendableMedia.kinds.length > 0,
            willSend: sendableMedia.chosen.length > 0,
            empreendimento: sendableMedia.propertyName,
            reason: sendableMedia.skipReason,
            // Story 75-270 — os títulos exatos do que sai, para a fala não inflar
            // ("algumas fotos e a planta" quando saiu 1 arquivo só).
            materiais: sendableMedia.chosen.map((a) => a.title),
          },
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

            // Story 75-163 — notifica o corretor quando a Nicole REMARCA ou CANCELA.
            if (
              event.event_type === "APPOINTMENT_RESCHEDULED" ||
              event.event_type === "APPOINTMENT_CANCELLED"
            ) {
              const notifyBrokerUserId =
                (event.metadata?.notification_broker_user_id as string | null) ??
                (event.metadata?.broker_user_id as string | null)
              if (notifyBrokerUserId) {
                const isCancel = event.event_type === "APPOINTMENT_CANCELLED"
                void notifyBrokerOfAppointment({
                  orgId,
                  brokerUserId: notifyBrokerUserId,
                  leadId: (event.metadata?.lead_id as string) ?? lead!.id,
                  leadName: (event.metadata?.lead_name as string | null) ?? null,
                  leadPhone: (event.metadata?.lead_phone as string | null) ?? null,
                  variant: isCancel ? "cancelled" : "rescheduled",
                  whenStr: isCancel
                    ? (event.metadata?.was as string | null) ?? null
                    : (event.metadata?.to as string | null) ?? null,
                }).catch((err) =>
                  console.error("[appointment-notify] reschedule/cancel dispatch error:", err)
                )
              }
            }
          },
        })

        // Story 75-156 — atraso "humano" curto antes de enviar (teto 3s no
        // componente por caractere). Completa o efeito do "digitando…" iniciado
        // acima. Roda no caminho assíncrono (após o ACK do webhook), então não
        // afeta a resposta HTTP 200 à Meta.
        await new Promise((resolve) =>
          setTimeout(resolve, calculateTypingDelay(response))
        )

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

        // Story 75-17 — Nicole envia mídia da biblioteca SE o lead pediu material
        // (planta/foto/tabela do empreendimento de interesse). Aditivo e seguro:
        // só envia com pedido claro + property_interest_id + asset ativo; nunca
        // quebra o fluxo (helper trata erros internamente).
        try {
          // Story 75-270 — a mídia segue o empreendimento da RESPOSTA: se a Nicole
          // pivotou de produto nesta fala (caso Orlice, 03/08: Vind → Yarden), a
          // resolução pré-fala aponta para o empreendimento antigo. Aqui ela é
          // realinhada; sem material do novo, nada é enviado.
          const midiaFinal = await reconcileMediaWithResponse(supabase, {
            orgId,
            leadId: lead!.id,
            conversationId: conversation!.id,
            text: asyncText,
            assistantMessage: response,
            preResolved: sendableMedia,
          })
          // Story 75-157: reusa a resolução pré-fala (mesma verdade da fala) e
          // loga o resultado (enviados/skip/erro) — antes era descartado/silencioso.
          const enviados = await sendLibraryMediaIfRequested(
            supabase,
            {
              orgId,
              leadId: lead!.id,
              leadPhone: fromRaw,
              // asyncText = texto resolvido (transcrição de áudio / caption de imagem);
              // `text` traz placeholder "[Mensagem de voz recebida]" para áudio (Story 56-2 AC6).
              text: asyncText,
              conversationId: conversation!.id,
              phoneNumberId: config.phone_number_id,
              accessToken: config.access_token,
            },
            midiaFinal
          )
          logEvent({
            level: "info",
            category: "webhook",
            event_type: "nicole_media_result",
            message: `Envio de mídia da Nicole: ${enviados} enviada(s)`,
            source: "webhook/whatsapp",
            org_id: orgId,
            metadata: {
              enviados,
              will_send: midiaFinal.chosen.length,
              skip_reason: midiaFinal.skipReason,
              // Story 75-270 — a fala prometeu com base na resolução pré-fala;
              // guardar as duas deixa visível quando o pivô mudou o resultado.
              will_send_pre_fala: sendableMedia.chosen.length,
              conversation_id: conversation!.id,
              lead_id: lead!.id,
            },
          })
        } catch (err) {
          console.error("[nicole-media] send error:", err)
        }

        // Story 75-187 — REMOVIDO o handoff pós-agendamento (63-15): a Nicole
        // continua respondendo após confirmar a visita. Ela só pausa quando um
        // humano age (broker_reply/manual). `notifyBrokerOfAppointment` (no
        // onEvent acima) segue avisando o corretor.
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
  // Story 50-3 (Epic 50): leads.metadata é populado via migration 074.
  // O select abaixo intencionalmente NÃO carrega metadata — o branch CTWA
  // (acima) lê metadata em separado para fazer merge não-destrutivo do ad_id.
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
