import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendWhatsAppTemplate } from "@web/lib/whatsapp/send-template"
import { toWhatsAppNumber } from "@web/lib/leads/whatsapp"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"

// Story 75-142 (Fase 2) — "Iniciar atendimento": dispara o template aprovado de
// abertura (`abertura_atendimento_corretor`) para leads frios (janela de 24h
// fechada / que nunca escreveram). Grava a mensagem no histórico (role=broker),
// faz handoff (Nicole para) e loga o envio. A janela freeform só reabre quando o
// LEAD responde — a UI orienta o corretor a aguardar a resposta.
const TEMPLATE_NAME = "abertura_atendimento_corretor"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const isPrivileged = ["admin", "supervisor", "gerente-comercial", "gerente-relacionamento"].includes(appUser.role)
  const db = isPrivileged ? createAdminClient() : supabase

  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone, assigned_broker_id, property_interest:property_interest_id(name)")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return NextResponse.json({ success: false, error: "LEAD_NOT_FOUND" }, { status: 404 })
  }
  if (!isPrivileged && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json({ success: false, error: "FORBIDDEN", message: "Este lead não está atribuído a você." }, { status: 403 })
  }

  const to = toWhatsAppNumber(lead.phone as string | null)
  if (!to) {
    return NextResponse.json({ success: false, error: "INVALID_PHONE", message: "Telefone inválido para WhatsApp." }, { status: 400 })
  }

  // Variáveis do template (não podem ser vazias — fallbacks).
  const one = (v: unknown): v is { name?: string } => !!v && typeof v === "object"
  const nome = (lead.name as string | null)?.trim() || "tudo bem"
  // Story 75-164 — nomeia QUEM ASSUMIU (usuário logado), não o assigned_broker do
  // lead. Consistente com a mensagem de transição (buildTransitionText usa appUser).
  const corretor = (appUser.name as string | null)?.trim() || "Trifold"
  const propRel = Array.isArray(lead.property_interest) ? lead.property_interest[0] : lead.property_interest
  // Story 75-164 — fallback lê natural após "no empreendimento " (evita "empreendimento nosso empreendimento").
  const empreendimento = (one(propRel) ? propRel.name : null)?.trim() || "que você procura"

  // Credenciais da empresa (admin p/ bypass de RLS do token).
  const admin = createAdminClient()
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", appUser.org_id)
    .eq("status", "active")
    .maybeSingle()
  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    return NextResponse.json({ success: false, error: "WHATSAPP_CONFIG_MISSING", message: "WhatsApp da empresa não configurado." }, { status: 400 })
  }

  try {
    await sendWhatsAppTemplate(waConfig.phone_number_id, waConfig.access_token, to, TEMPLATE_NAME, [
      { type: "body", parameters: [
        { type: "text", text: nome },
        { type: "text", text: corretor },
        { type: "text", text: empreendimento },
      ] },
    ])
  } catch (err) {
    void logWhatsappSend(admin, { orgId: appUser.org_id, template: TEMPLATE_NAME, category: "marketing", recipientType: "lead", toPhone: to, status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Unknown" })
    return NextResponse.json({ success: false, error: "TEMPLATE_SEND_FAILED", message: "Não foi possível enviar o convite. Verifique o número e tente novamente." }, { status: 502 })
  }

  void logWhatsappSend(admin, { orgId: appUser.org_id, template: TEMPLATE_NAME, category: "marketing", recipientType: "lead", toPhone: to, status: "sent" })

  // Conversa (cria se não existir) + registro no histórico + handoff da Nicole.
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

  // Story 75-166 — espelho do template Meta `abertura_atendimento_corretor` (APPROVED
  // 2026-07-16 com wording neutro): "da equipe Trifold" (era "corretor da Trifold").
  // Mantém paridade com o texto que o lead efetivamente recebe.
  const renderedText = `Olá ${nome}! Aqui é ${corretor}, da equipe Trifold. Vi seu interesse no empreendimento ${empreendimento} e vou te acompanhar por aqui. Posso te enviar as informações agora?`

  if (conversation) {
    await db.from("messages").insert({
      conversation_id: conversation.id,
      role: "broker",
      content: renderedText,
      metadata: { template: TEMPLATE_NAME, sent_by: appUser.id, channel: "whatsapp" },
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
