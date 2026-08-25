import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"

/**
 * Story 75-368 — Botão "Follow-up Nicole: Ligado/Desligado" na gaveta do lead.
 *
 * POST /api/leads/[id]/followup-nicole   body: { off: boolean }
 *
 * Liga/desliga o follow-up AUTOMÁTICO da Nicole (o cron) para um lead específico,
 * gravando `leads.nicole_followup_off_at` (NULL = ligado, o padrão).
 *
 * NÃO confundir com `handoff`/`resume-ai` (Epic 63), que ligam e desligam a IA na
 * CONVERSA ao vivo via `conversations.is_ai_active`. Aqui é o cron, e vale inclusive
 * para lead que nunca conversou — que é justamente o caso que o `is_ai_active` não
 * cobre, por morar em `conversations`.
 *
 * Desligar silencia só o envio da Nicole (`follow_up_log` type=`nicole_sent`) e
 * PRESERVA o alerta ao corretor (type=`alert_broker`) — ver AC2 da story.
 *
 * Permissão (espelha `resume-ai`, ação reversível de baixo risco): capability
 * `leads.followup_nicole` OU ser o corretor DONO do lead (`assigned_broker_id`).
 *
 * Idempotente: pedir o estado que já vale retorna 200 sem UPDATE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  let body: { off?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.off !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { off: boolean }" },
      { status: 400 }
    )
  }
  const off = body.off

  // Lead + isolamento de org (RLS + checagem explícita).
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_broker_id, nicole_followup_off_at")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Permissão: capability OU corretor dono do lead.
  const hasCapability = await can(appUser.id, appUser.org_id, "leads.followup_nicole")
  if (!hasCapability && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const jaEstavaDesligado = lead.nicole_followup_off_at != null

  // Idempotente: só faz UPDATE quando o estado muda de fato.
  if (jaEstavaDesligado !== off) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({ nicole_followup_off_at: off ? new Date().toISOString() : null })
      .eq("id", lead.id)
      .eq("org_id", appUser.org_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  // Trilha de auditoria — registra a intenção mesmo no caso idempotente, igual
  // ao `resume-ai`.
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: lead.id,
    user_id: appUser.id,
    type: off ? "followup_nicole_off" : "followup_nicole_on",
    description: off
      ? "Follow-up da Nicole desligado neste lead"
      : "Follow-up da Nicole religado neste lead",
    metadata: {
      triggered_by: appUser.id,
      triggered_by_role: appUser.role,
      no_op: jaEstavaDesligado === off,
    },
  })

  return NextResponse.json({ success: true, off })
}
