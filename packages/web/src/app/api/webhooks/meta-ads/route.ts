import { NextRequest, NextResponse, after } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { createAdminClient } from "@web/lib/supabase/admin"
import { triggerAutomations } from "@web/lib/email-automations"

const META_API_BASE = "https://graph.facebook.com/v21.0"

function getSupabaseAdmin() {
  return createAdminClient()
}

// GET — Webhook verification (Meta sends this to verify the endpoint)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// POST — Incoming lead from Meta Lead Form webhook
export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  const rawBody = await request.text()

  if (!appSecret) {
    console.error("[META-WEBHOOK] META_APP_SECRET not configured — webhook blocked")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const signature = request.headers.get("x-hub-signature-256")
  const expectedSignature =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const signatureValid = signature === expectedSignature

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const entry = body.entry as Array<Record<string, unknown>> | undefined
  const firstEntry = entry?.[0] as Record<string, unknown> | undefined
  const changes = firstEntry?.changes as Array<Record<string, unknown>> | undefined
  const value = changes?.[0]?.value as Record<string, unknown> | undefined
  const leadgenId = value?.leadgen_id as string | undefined

  // Persistir todos os eventos em webhook_logs antes de qualquer early return
  const adminSupabase = createAdminClient()
  const { data: logEntry } = await adminSupabase
    .from("webhook_logs")
    .insert({
      source: "meta_ads",
      event_type: leadgenId ? (value?.form_id ? "leadgen" : "unknown") : "ping",
      payload: body,
      leadgen_id: leadgenId ?? null,
      signature_valid: signatureValid,
      processed: false,
    })
    .select("id")
    .single()

  if (!signatureValid) {
    if (logEntry?.id) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processing_error: "invalid_signature" })
        .eq("id", logEntry.id)
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
  }

  if (!leadgenId) {
    if (logEntry?.id) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processed: true })
        .eq("id", logEntry.id)
    }
    return NextResponse.json({ status: "ok" })
  }

  // AC6: Log estruturado com resultado real da validação
  console.log(
    JSON.stringify({
      type: "meta_webhook_received",
      leadgen_id: leadgenId,
      form_id: value?.form_id ?? null,
      ad_id: value?.ad_id ?? null,
      campaign_id: value?.campaign_id ?? null,
      page_id: firstEntry?.id ?? null,
      timestamp: new Date().toISOString(),
      signature_valid: signatureValid,
      processing: "async",
    })
  )

  // AC3: Retornar 200 imediatamente; processamento é async via after()
  after(async () => {
    await processLeadAsync(leadgenId, value ?? {}, firstEntry ?? {}, logEntry?.id)
  })

  return NextResponse.json({ status: "ok" })
}

// ---------------------------------------------------------------------------
// Async processing
// ---------------------------------------------------------------------------

async function processLeadAsync(
  leadgenId: string,
  webhookValue: Record<string, unknown>,
  entry: Record<string, unknown>,
  logId?: string,
) {
  const supabase = getSupabaseAdmin()
  const adminSupabase = createAdminClient()

  try {
    // AC1 + AC2: Buscar dados do lead via Graph API (ou usar field_data do payload se disponível)
    const leadData = await fetchLeadData(leadgenId, webhookValue)

    const fieldData: Array<{ name: string; values: string[] }> =
      leadData?.field_data ?? []

    const getField = (name: string): string | null => {
      const field = fieldData.find(
        (f) =>
          f.name.toLowerCase() === name.toLowerCase() ||
          f.name.toLowerCase().includes(name.toLowerCase())
      )
      return field?.values?.[0] ?? null
    }

    const name = getField("full_name") ?? getField("name")
    const email = getField("email")
    const phone = getField("phone_number") ?? getField("phone")

    // Usar campaign_id do payload ou do que veio da Graph API
    const campaignId =
      (webhookValue.campaign_id as string | undefined) ??
      (leadData?.campaign_id as string | undefined) ??
      null

    // AC4: Resolver nome da campanha
    const campaignName = campaignId ? await resolveCampaignName(campaignId) : null

    const orgId = await resolveOrgId(supabase)
    if (!orgId) {
      console.error("[META-WEBHOOK] No active org found — lead not created")
      return
    }

    const defaultStageId = await getDefaultStageId(supabase, orgId)

    // AC8: Verificar lead existente pelo phone
    let leadId: string | null = null
    let existingUtmCampaign: string | null = null
    if (phone) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id, utm_campaign")
        .eq("phone", phone)
        .eq("org_id", orgId)
        .single()

      if (existing) {
        leadId = existing.id
        existingUtmCampaign = existing.utm_campaign ?? null
      }
    }

    const utmData = {
      utm_source: "meta_ads",
      utm_medium: (webhookValue.platform as string | undefined) ?? "facebook",
      utm_campaign: campaignName ?? null,
      utm_content: (webhookValue.ad_name as string | undefined) ?? null,
    }

    const metaMetadata = {
      leadgen_id: leadgenId,
      form_id: (webhookValue.form_id as string | undefined) ??
        (leadData?.form_id as string | undefined) ?? null,
      ad_id: (webhookValue.ad_id as string | undefined) ??
        (leadData?.ad_id as string | undefined) ?? null,
      ad_group_id: (webhookValue.adgroup_id as string | undefined) ?? null,
      campaign_id: campaignId,
      page_id: entry?.id ?? null,
      field_data: fieldData,
      // AC7: flag de dados parciais
      incomplete: !phone && !email,
    }

    if (leadId) {
      // AC8: metadata sempre atualizado; utm_* só atualizado se ainda não preenchido
      await supabase
        .from("leads")
        .update({
          metadata: metaMetadata,
          ...(existingUtmCampaign === null ? utmData : {}),
        })
        .eq("id", leadId)
    } else {
      // Criar novo lead — mesmo sem phone/email (AC7)
      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          org_id: orgId,
          name: name ?? null,
          email: email ?? null,
          phone: phone ?? null,
          channel: "meta_ads",
          source: "meta_ads",
          stage_id: defaultStageId,
          ...utmData,
          metadata: metaMetadata,
        })
        .select("id")
        .single()

      if (newLead?.id) {
        void triggerAutomations("lead.created", {
          id: newLead.id,
          email: email ?? null,
          name: name ?? null,
          phone: phone ?? null,
          org_id: orgId,
        })
      }
      leadId = newLead?.id ?? null
    }

    if (!leadId) {
      console.error("[META-WEBHOOK] Failed to create or find lead", { leadgen_id: leadgenId })
      return
    }

    await supabase.from("activities").insert({
      org_id: orgId,
      lead_id: leadId,
      type: "lead_created",
      description: "Lead criado via Meta Ads Lead Form",
      metadata: {
        source: "meta_ads",
        leadgen_id: leadgenId,
        form_id: metaMetadata.form_id,
        campaign_name: campaignName,
        incomplete: metaMetadata.incomplete,
      },
    })

    if (logId) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processed: true, org_id: orgId })
        .eq("id", logId)
    }
  } catch (error) {
    console.error("[META-WEBHOOK] processLeadAsync error:", error)
    if (logId) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await adminSupabase
        .from("webhook_logs")
        .update({ processing_error: errorMessage })
        .eq("id", logId)
    }
  }
}

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

interface MetaLeadData {
  id: string
  field_data: Array<{ name: string; values: string[] }>
  ad_id?: string
  campaign_id?: string
  form_id?: string
  created_time?: string
}

// AC1 + AC2: Busca dados do lead via Graph API; usa field_data do payload se já disponível
async function fetchLeadData(
  leadgenId: string,
  webhookValue: Record<string, unknown>
): Promise<MetaLeadData | null> {
  const inlineFieldData = webhookValue.field_data as
    | Array<{ name: string; values: string[] }>
    | undefined

  // AC2: Se field_data veio preenchido no payload (sandbox/test), usar diretamente
  if (inlineFieldData && inlineFieldData.length > 0) {
    return {
      id: leadgenId,
      field_data: inlineFieldData,
      ad_id: webhookValue.ad_id as string | undefined,
      campaign_id: webhookValue.campaign_id as string | undefined,
      form_id: webhookValue.form_id as string | undefined,
    }
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    console.error("[META-WEBHOOK] META_PAGE_ACCESS_TOKEN not configured — cannot fetch lead data")
    return null
  }

  return fetchWithRetry(() =>
    fetch(
      `${META_API_BASE}/${leadgenId}?access_token=${token}&fields=field_data,ad_id,campaign_id,form_id,created_time`,
      { signal: AbortSignal.timeout(10_000) }
    ).then((res) => {
      if (!res.ok) throw new Error(`Graph API error ${res.status}`)
      return res.json() as Promise<MetaLeadData>
    })
  )
}

// AC4: Resolver nome da campanha a partir do campaign_id
async function resolveCampaignName(campaignId: string): Promise<string | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return null

  const result = await fetchWithRetry(() =>
    fetch(
      `${META_API_BASE}/${campaignId}?access_token=${token}&fields=name`,
      { signal: AbortSignal.timeout(10_000) }
    ).then((res) => {
      if (!res.ok) throw new Error(`Graph API campaign error ${res.status}`)
      return res.json() as Promise<{ id: string; name: string }>
    })
  )

  return result?.name ?? null
}

// AC5: Retry com backoff exponencial (1s → 2s → 4s)
async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1
      console.error(
        `[META-WEBHOOK] Graph API attempt ${attempt + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error
      )
      if (isLastAttempt) return null
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function resolveOrgId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_config")
    .select("org_id")
    .eq("status", "active")
    .single()

  return data?.org_id ?? null
}

// AC9: Stage ID dinâmico via kanban_stages (substitui DEFAULT_STAGE_ID hardcoded)
async function getDefaultStageId(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .single()

  if (data?.id) return data.id

  // Fallback: primeiro estágio por posição
  const { data: firstStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position", { ascending: true })
    .limit(1)
    .single()

  return firstStage?.id ?? "00000000-0000-0000-0001-000000000001"
}
