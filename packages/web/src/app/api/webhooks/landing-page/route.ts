import { NextRequest, NextResponse, after } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { triggerAutomations } from "@web/lib/email-automations"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// OPTIONS — CORS preflight (WordPress faz preflight antes do POST)
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// POST — Lead vindo de landing page WordPress
export async function POST(request: NextRequest) {
  // Bracket notation prevents Turbopack/Next.js from statically inlining as undefined
  const env = process.env
  const secret = (env["LANDING_PAGE_WEBHOOK_SECRET"] ?? "").trim()

  if (!secret) {
    console.error("[LP-WEBHOOK] LANDING_PAGE_WEBHOOK_SECRET não configurado")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503, headers: CORS_HEADERS })
  }

  // Autenticação: Bearer header OU query param ?token=...
  const authHeader = request.headers.get("authorization") ?? ""
  const queryToken = request.nextUrl.searchParams.get("token") ?? ""
  const providedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : queryToken.trim()

  if (providedToken !== secret) {
    console.warn("[LP-WEBHOOK] Token inválido recebido")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS })
  }

  // Parse do body: JSON ou form-urlencoded
  const fields: Record<string, string> = {}
  const contentType = request.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("application/json")) {
      const json = await request.json() as Record<string, unknown>
      flattenIntoFields(json, fields)
    } else {
      // form-urlencoded — Elementor e outros plugins
      const text = await request.text()
      const params = new URLSearchParams(text)
      params.forEach((v, k) => {
        // Elementor envia como "form_fields[name]" — extrair só o nome interno
        const match = k.match(/^form_fields\[([^\]]+)\]$/)
        const key = (match ? match[1]! : k).toLowerCase()
        fields[key] = v
      })
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: CORS_HEADERS })
  }

  // Detectar source/utm da query string (ex: ?utm_source=google)
  const utmSource = request.nextUrl.searchParams.get("utm_source") ?? fields.utm_source ?? null
  const utmMedium = request.nextUrl.searchParams.get("utm_medium") ?? fields.utm_medium ?? null
  const utmCampaign = request.nextUrl.searchParams.get("utm_campaign") ?? fields.utm_campaign ?? null
  const utmContent = request.nextUrl.searchParams.get("utm_content") ?? fields.utm_content ?? null
  const pageName = request.nextUrl.searchParams.get("page") ?? fields.page ?? null

  // Logar recebimento imediatamente
  const adminSupabase = createAdminClient()
  const { data: logEntry } = await adminSupabase
    .from("webhook_logs")
    .insert({
      source: "landing_page",
      event_type: "lead_submission",
      payload: { fields, utm: { utmSource, utmMedium, utmCampaign }, page: pageName },
      signature_valid: true,
      processed: false,
    })
    .select("id")
    .single()

  // Processar de forma async — responde 200 imediatamente
  after(async () => {
    await processLandingPageLead(fields, {
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      pageName,
      logId: logEntry?.id,
    })
  })

  return NextResponse.json({ status: "ok" }, { headers: CORS_HEADERS })
}

// ---------------------------------------------------------------------------
// Processamento assíncrono
// ---------------------------------------------------------------------------

interface UtmContext {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  pageName: string | null
  logId?: string
}

async function processLandingPageLead(
  fields: Record<string, string>,
  ctx: UtmContext,
) {
  const adminSupabase = createAdminClient()

  try {
    // Normalizar campos — suporta nomes do WPForms, CF7, Elementor e genéricos
    const name = pick(fields, ["nome", "name", "your-name", "full_name", "fullname", "field_name"]) ?? null
    const email = pick(fields, ["email", "your-email", "e-mail", "field_email"]) ?? null
    const rawPhone = pick(fields, ["telefone", "phone", "celular", "whatsapp", "your-phone", "field_phone", "fone"]) ?? null
    const phone = rawPhone ? normalizePhone(rawPhone) : null
    const message = pick(fields, ["mensagem", "message", "your-message", "texto", "assunto", "resposta"]) ?? null
    // Nome do formulário Elementor (form_name) — usado como source para identificar a LP
    const formName = fields.form_name?.trim() || null

    if (!name && !email && !phone) {
      console.warn("[LP-WEBHOOK] Lead sem nome, email ou telefone — ignorado", { fields })
      return
    }

    const orgId = await resolveOrgId(adminSupabase)
    if (!orgId) {
      console.error("[LP-WEBHOOK] Nenhuma org ativa encontrada")
      return
    }

    const defaultStageId = await getDefaultStageId(adminSupabase, orgId)

    // Verificar duplicata por telefone
    let leadId: string | null = null
    if (phone) {
      const { data: existing } = await adminSupabase
        .from("leads")
        .select("id")
        .eq("phone", phone)
        .eq("org_id", orgId)
        .single()

      if (existing) {
        leadId = existing.id
        // Atualizar utm se não tiver campanha
        await adminSupabase
          .from("leads")
          .update({
            ...(ctx.utmCampaign ? { utm_campaign: ctx.utmCampaign } : {}),
            ...(ctx.utmSource ? { utm_source: ctx.utmSource } : {}),
          })
          .eq("id", leadId)
          .is("utm_campaign", null)
      }
    }

    if (!leadId) {
      const { data: newLead } = await adminSupabase
        .from("leads")
        .insert({
          org_id: orgId,
          name,
          email,
          phone,
          channel: "website",
          source: "website",
          stage_id: defaultStageId,
          utm_source: ctx.utmSource,
          utm_medium: ctx.utmMedium,
          utm_campaign: ctx.utmCampaign,
          utm_content: ctx.utmContent ?? formName,
          metadata: {
            landing_page: formName ?? ctx.pageName,
            message: message ?? null,
            raw_fields: fields,
          },
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
        void distributeLeadToNextBroker(newLead.id, orgId)
        leadId = newLead.id
      }
    }

    if (!leadId) {
      console.error("[LP-WEBHOOK] Falha ao criar lead", { name, email, phone })
      return
    }

    await adminSupabase.from("activities").insert({
      org_id: orgId,
      lead_id: leadId,
      type: "lead_created",
      description: `Lead criado via landing page${ctx.pageName ? `: ${ctx.pageName}` : ""}`,
      metadata: {
        source: "landing_page",
        page: ctx.pageName,
        utm_campaign: ctx.utmCampaign,
      },
    })

    if (ctx.logId) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processed: true, org_id: orgId })
        .eq("id", ctx.logId)
    }

    console.log(JSON.stringify({
      type: "landing_page_lead_processed",
      lead_id: leadId,
      page: ctx.pageName,
      has_phone: Boolean(phone),
      has_email: Boolean(email),
    }))
  } catch (error) {
    console.error("[LP-WEBHOOK] Erro no processamento:", error)
    if (ctx.logId) {
      const msg = error instanceof Error ? error.message : String(error)
      await adminSupabase
        .from("webhook_logs")
        .update({ processing_error: msg })
        .eq("id", ctx.logId)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Suporta JSON plano E aninhado (Elementor envia {form_fields:{name:...}} ou array de {id,value})
function flattenIntoFields(json: Record<string, unknown>, out: Record<string, string>) {
  for (const [k, v] of Object.entries(json)) {
    if (k === "form_fields" && v && typeof v === "object" && !Array.isArray(v)) {
      // Elementor Pro: {"form_fields": {"name": "...", "email": "..."}}
      for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof fv === "string") out[fk.toLowerCase()] = fv
        else if (fv !== null && fv !== undefined) out[fk.toLowerCase()] = String(fv)
      }
    } else if (k === "fields" && Array.isArray(v)) {
      // Elementor alternativo: {"fields": [{"id":"name","value":"..."}]}
      for (const item of v as Array<Record<string, unknown>>) {
        const id = item.id as string | undefined
        const val = item.value as string | undefined
        if (id && val !== undefined) out[id.toLowerCase()] = String(val)
      }
    } else if (typeof v === "string") {
      out[k.toLowerCase()] = v
    } else if (v !== null && v !== undefined && typeof v !== "object") {
      out[k.toLowerCase()] = String(v)
    }
  }
}

function pick(obj: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const val = obj[k]?.trim()
    if (val) return val
  }
  return null
}

function normalizePhone(raw: string): string {
  // Remove tudo que não for dígito
  const digits = raw.replace(/\D/g, "")
  // Se vier sem DDI, adiciona +55
  if (digits.length === 11 || digits.length === 10) return `+55${digits}`
  if (digits.length === 13 && digits.startsWith("55")) return `+${digits}`
  return `+${digits}`
}

async function resolveOrgId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_config")
    .select("org_id")
    .eq("status", "active")
    .single()

  return data?.org_id ?? null
}

async function getDefaultStageId(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .single()

  if (data?.id) return data.id

  const { data: firstStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position", { ascending: true })
    .limit(1)
    .single()

  return firstStage?.id ?? "00000000-0000-0000-0001-000000000001"
}
