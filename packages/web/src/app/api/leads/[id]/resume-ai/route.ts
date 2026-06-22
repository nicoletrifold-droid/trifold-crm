import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

/**
 * Story 63-14 (Epic 63) — Botão "Devolver para a Nicole".
 *
 * POST /api/leads/[id]/resume-ai
 *
 * Reativa a IA (`conversations.is_ai_active=true`) da conversa ativa do lead,
 * permitindo que o corretor devolva o atendimento à Nicole sem esperar as 24h
 * de reativação automática (Story 63-13). É o inverso de `handoff/route.ts`.
 *
 * Permissão (mais ampla que handoff, por ser ação reversível de baixo risco —
 * o corretor reassume enviando uma nova mensagem via 63-13): admin/supervisor/
 * gerente-comercial OU o corretor DONO do lead (`assigned_broker_id`).
 *
 * Idempotente: se a Nicole já está ativa, retorna 200 sem UPDATE. NÃO altera
 * `handoff_at`/`handoff_reason` (preserva o audit trail do handoff original).
 * Escopo por-conversa (`.eq("id", conversation.id)`). CON-1: sem tel:/wa.me.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Lead + isolamento de org (RLS + checagem explícita).
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_broker_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Permissão: admin/supervisor/gerente-comercial OU corretor dono do lead.
  const isAdmin = ["admin", "supervisor", "gerente-comercial"].includes(
    appUser.role
  )
  if (!isAdmin && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, is_ai_active")
    .eq("lead_id", id)
    .eq("status", "active")
    .maybeSingle()

  if (!conversation) {
    return NextResponse.json(
      { error: "No active conversation found" },
      { status: 404 }
    )
  }

  // Idempotente: só faz UPDATE quando a Nicole está inativa.
  if (!conversation.is_ai_active) {
    const { error: convError } = await supabase
      .from("conversations")
      .update({ is_ai_active: true })
      .eq("id", conversation.id)

    if (convError) {
      return NextResponse.json({ error: convError.message }, { status: 500 })
    }
  }

  // Activity log (AC2) — registra a intenção do usuário mesmo no caso idempotente.
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "ai_resumed",
    description: "Nicole reativada manualmente",
    metadata: {
      triggered_by: appUser.id,
      triggered_by_role: appUser.role,
      conversation_id: conversation.id,
    },
  })

  return NextResponse.json({
    success: true,
    conversationId: conversation.id,
    isAiActive: true,
  })
}
