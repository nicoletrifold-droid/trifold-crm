import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"
import { sendWhatsAppTemplate } from "@web/lib/whatsapp/send-template"
import { toWhatsAppNumber } from "@web/lib/leads/whatsapp"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"
import { loadOpeningContext, OPENING_PRIVILEGED_ROLES } from "@web/lib/whatsapp/opening-context"
import {
  DEFAULT_OPENING_TEMPLATE,
  OPENING_TEMPLATE_PARAMS,
  listApprovedOpeningTemplates,
  resolveOpeningParams,
  renderOpeningBody,
} from "@web/lib/whatsapp/opening-templates"

// Story 75-142 (Fase 2) — "Iniciar atendimento": dispara template aprovado de
// abertura para leads frios (janela de 24h fechada / que nunca escreveram).
// Story 75-217 — aceita `{ template }` no body para escolher entre os templates
// de abertura aprovados (menu por contexto); sem body, mantém o template
// original. O texto gravado no histórico espelha o corpo REAL vindo da Meta.
// Grava a mensagem (role=broker), faz handoff (Nicole para) e loga o envio.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const body = (await req.json().catch(() => null)) as { template?: string } | null
  const templateName = body?.template ?? DEFAULT_OPENING_TEMPLATE
  if (!OPENING_TEMPLATE_PARAMS[templateName]) {
    return NextResponse.json({ success: false, error: "UNKNOWN_TEMPLATE", message: "Mensagem de abertura desconhecida." }, { status: 400 })
  }

  const context = await loadOpeningContext(id, appUser, supabase)
  if (!context.ok) {
    return NextResponse.json({ success: false, error: context.error, message: context.message }, { status: context.status })
  }
  const { lead, ctx, waConfig } = context

  const to = toWhatsAppNumber(lead.phone)
  if (!to) {
    return NextResponse.json({ success: false, error: "INVALID_PHONE", message: "Telefone inválido para WhatsApp." }, { status: 400 })
  }
  if (!waConfig.waba_id) {
    return NextResponse.json({ success: false, error: "WABA_ID_MISSING", message: "Conta WhatsApp Business não configurada." }, { status: 400 })
  }

  const admin = createOrgScopedAdminClient(appUser.org_id)

  // Valida contra a Meta (só template APROVADO sai) e obtém o corpo real
  // para o espelho no histórico — nada de cópia hardcoded (lição da 75-166).
  let templateBody: string
  try {
    const approved = await listApprovedOpeningTemplates(waConfig.waba_id, waConfig.access_token)
    const tpl = approved.find((t) => t.name === templateName)
    if (!tpl) {
      return NextResponse.json({ success: false, error: "TEMPLATE_NOT_APPROVED", message: "Esta mensagem ainda não foi aprovada pelo WhatsApp." }, { status: 400 })
    }
    templateBody = tpl.body
  } catch (err) {
    console.error("[START-WHATSAPP] template list failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, error: "TEMPLATE_LIST_FAILED", message: "Não foi possível validar a mensagem de abertura. Tente novamente." }, { status: 502 })
  }

  const templateParams = resolveOpeningParams(templateName, ctx)
  if (!templateParams) {
    return NextResponse.json({ success: false, error: "UNKNOWN_TEMPLATE", message: "Mensagem de abertura desconhecida." }, { status: 400 })
  }

  try {
    await sendWhatsAppTemplate(waConfig.phone_number_id, waConfig.access_token, to, templateName, [
      { type: "body", parameters: templateParams.map((text) => ({ type: "text" as const, text })) },
    ])
  } catch (err) {
    void logWhatsappSend(admin, { orgId: appUser.org_id, template: templateName, category: "marketing", recipientType: "lead", toPhone: to, status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Unknown" })
    return NextResponse.json({ success: false, error: "TEMPLATE_SEND_FAILED", message: "Não foi possível enviar o convite. Verifique o número e tente novamente." }, { status: 502 })
  }

  void logWhatsappSend(admin, { orgId: appUser.org_id, template: templateName, category: "marketing", recipientType: "lead", toPhone: to, status: "sent" })

  // Conversa (cria se não existir) + registro no histórico + handoff da Nicole.
  // Story 75-267 — importa a fonte (era array inline duplicado).
  const isPrivileged = (OPENING_PRIVILEGED_ROLES as readonly string[]).includes(appUser.role)
  const db = isPrivileged ? admin : supabase
  let { data: conversation } = await db
    .from("conversations")
    .select("id, is_ai_active")
    .eq("lead_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle()
  if (!conversation) {
    const { data: created } = await db
      .from("conversations")
      .insert({ org_id: appUser.org_id, lead_id: id, channel: "whatsapp", status: "active" })
      .select("id, is_ai_active")
      .single()
    conversation = created ?? null
  }

  const renderedText = renderOpeningBody(templateBody, templateParams)

  if (conversation) {
    await db.from("messages").insert({
      conversation_id: conversation.id,
      role: "broker",
      content: renderedText,
      metadata: { template: templateName, sent_by: appUser.id, channel: "whatsapp" },
    })
    if (conversation.is_ai_active) {
      await admin
        .from("conversations")
        .update({ is_ai_active: false, handoff_at: new Date().toISOString(), handoff_reason: "broker_reply" })
        .eq("id", conversation.id)
    }
  }

  return NextResponse.json({ success: true })
}
