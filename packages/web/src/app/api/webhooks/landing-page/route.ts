import { NextRequest, NextResponse } from "next/server"
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

  // Processar o lead de forma SÍNCRONA antes de responder.
  //
  // Antes usávamos `after()` (processamento após a resposta 200). Em produção na
  // Vercel esse callback era descartado de forma intermitente antes de terminar,
  // sem lançar exceção: o lead nunca era criado, webhook_logs.processed ficava
  // false para sempre e o cliente já tinha recebido 200. Leads eram perdidos
  // silenciosamente. Trocamos por await direto: a resposta demora um pouco mais
  // (tempo de criar o lead + resolver org/dedup), mas só retornamos 200 se o
  // lead foi realmente processado — e um 5xx claro se falhar, que o proxy
  // consumidor já trata como erro.
  const result = await processLandingPageLead(fields, {
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    pageName,
    logId: logEntry?.id,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: "Lead processing failed" },
      { status: 500, headers: CORS_HEADERS },
    )
  }

  return NextResponse.json({ status: "ok" }, { headers: CORS_HEADERS })
}

// ---------------------------------------------------------------------------
// Processamento do lead (síncrono — awaited antes da resposta)
// ---------------------------------------------------------------------------

interface UtmContext {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  pageName: string | null
  logId?: string
}

// Resultado do processamento. `ok: false` faz o handler POST responder 5xx,
// sinalizando ao proxy consumidor que o lead NÃO foi processado com sucesso.
interface ProcessResult {
  ok: boolean
}

async function processLandingPageLead(
  fields: Record<string, string>,
  ctx: UtmContext,
): Promise<ProcessResult> {
  // createAdminClient() precisa estar DENTRO do try: com env vars ausentes/inválidas
  // ele não lança na criação do client, mas a primeira query feita com ele falha —
  // e essa falha tem que ser capturada e reportada (webhook_logs.processing_error +
  // 5xx), não virar exceção solta.
  let adminSupabase: SupabaseClient | null = null

  try {
    adminSupabase = createAdminClient()

    // Normalizar campos — suporta nomes do WPForms, CF7, Elementor e genéricos
    const name = pick(fields, ["nome", "name", "your-name", "full_name", "fullname", "field_name"]) ?? null
    const email = pick(fields, ["email", "your-email", "e-mail", "field_email"]) ?? null
    const rawPhone = pick(fields, ["telefone", "phone", "celular", "whatsapp", "your-phone", "field_phone", "fone"]) ?? null
    const phone = rawPhone ? normalizePhone(rawPhone) : null
    const message = pick(fields, ["mensagem", "message", "your-message", "texto", "assunto", "resposta"]) ?? null
    // Nome do formulário Elementor (form_name) — usado como source para identificar a LP
    const formName = fields.form_name?.trim() || null

    if (!name && !email && !phone) {
      // Submissão vazia/inválida — descarte esperado, não é falha de processamento.
      console.warn("[LP-WEBHOOK] Lead sem nome, email ou telefone — ignorado", { fields })
      if (ctx.logId) {
        await adminSupabase
          .from("webhook_logs")
          .update({ processed: true })
          .eq("id", ctx.logId)
      }
      return { ok: true }
    }

    const orgId = await resolveOrgId(adminSupabase)
    if (!orgId) {
      console.error("[LP-WEBHOOK] Nenhuma org ativa encontrada")
      if (ctx.logId) {
        await adminSupabase
          .from("webhook_logs")
          .update({ processing_error: "Nenhuma org ativa encontrada" })
          .eq("id", ctx.logId)
      }
      return { ok: false }
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
        // Fire-and-forget deliberado: a criação do LEAD (acima) é a parte crítica
        // que precisa estar concluída antes do 200. Automações e distribuição pro
        // corretor NÃO eram a causa da perda silenciosa, então mantê-las sem await
        // evita aumentar a latência da resposta e reduz risco de regressão. Se
        // falharem, o lead já existe e pode ser reprocessado.
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
      if (ctx.logId) {
        await adminSupabase
          .from("webhook_logs")
          .update({ processing_error: "Falha ao criar lead", org_id: orgId })
          .eq("id", ctx.logId)
      }
      return { ok: false }
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

    return { ok: true }
  } catch (error) {
    console.error("[LP-WEBHOOK] Erro no processamento:", error)
    // Registrar o erro no log só é possível se o client foi criado. Se
    // createAdminClient() foi a origem da falha, adminSupabase é null e não há
    // como gravar processing_error — mas ainda retornamos ok:false para o 5xx.
    if (ctx.logId && adminSupabase) {
      const msg = error instanceof Error ? error.message : String(error)
      await adminSupabase
        .from("webhook_logs")
        .update({ processing_error: msg })
        .eq("id", ctx.logId)
        .then(undefined, (logErr) => {
          console.error("[LP-WEBHOOK] Falha ao registrar processing_error:", logErr)
        })
    }
    return { ok: false }
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
