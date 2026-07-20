import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { triggerAutomations } from "@web/lib/email-automations"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"
import { POST_VISIT_STAGE_IDS } from "@web/lib/appointments/no-show-decision"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const body = await request.json()

  if (!body.stage_id) {
    return NextResponse.json(
      { error: "stage_id is required" },
      { status: 400 }
    )
  }

  // Get current lead with current stage
  const { data: lead } = await supabase
    .from("leads")
    .select("id, stage_id, stage:kanban_stages!stage_id(id, name)")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Verify new stage exists
  const { data: newStage } = await supabase
    .from("kanban_stages")
    .select("id, name")
    .eq("id", body.stage_id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!newStage) {
    return NextResponse.json({ error: "Stage not found" }, { status: 404 })
  }

  const fromStageArr = lead.stage as unknown as Array<{
    id: string
    name: string
  }> | null
  const fromStage = fromStageArr?.[0] ?? null

  // Ao SAIR de Perdido/Não Qualificado (reativação por mudança de etapa manual), limpa o
  // lost_reason residual. A etapa destino aqui é sempre is_active=true (validada acima), então
  // nunca é Perdido — se a origem era Perdido, o lead está sendo reativado e não pode carregar
  // lost_reason (senão some do pipeline / fica read-only). Convenção: "perdido = ETAPA".
  const leavingPerdido = PERDIDO_STAGE_IDS.includes(lead.stage_id)
  const stageUpdate: { stage_id: string; lost_reason?: null } = { stage_id: body.stage_id }
  if (leavingPerdido) stageUpdate.lost_reason = null

  // Update lead stage
  const { data: updatedLead, error: updateError } = await supabase
    .from("leads")
    .update(stageUpdate)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (updateError || !updatedLead) {
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    )
  }

  // Story 75-177 — mover para etapa pós-visita resolve os agendamentos abertos do lead
  // (fecha a lacuna na origem: senão o detector de no-show reverteria o lead 48h depois).
  // Best-effort: falha aqui não deve quebrar a mudança de etapa (que já foi persistida).
  if (POST_VISIT_STAGE_IDS.includes(body.stage_id)) {
    await supabase
      .from("appointments")
      .update({ status: "completed" })
      .eq("lead_id", id)
      .eq("org_id", appUser.org_id)
      .in("status", ["scheduled", "confirmed"])
  }

  // O log em `activities` (type 'stage_change') é gravado pelo trigger
  // trg_log_lead_stage_change no UPDATE acima (migration 124, Story 75-72).
  // Mantemos abaixo apenas o audit_logs (tabela distinta) e as automações.

  void triggerAutomations("lead.status_changed", {
    id: updatedLead.id,
    email: (updatedLead.email as string | null) ?? null,
    name: (updatedLead.name as string | null) ?? null,
    phone: (updatedLead.phone as string | null) ?? null,
    org_id: appUser.org_id,
  }, { status: newStage.name })

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.stage_change",
    entity_type: "lead",
    entity_id: id,
    entity_name: (updatedLead.name as string | null) ?? undefined,
    metadata: {
      from_stage: fromStage
        ? { id: fromStage.id, name: fromStage.name }
        : null,
      to_stage: { id: newStage.id, name: newStage.name },
    },
    ip_address: getRequestIp(request.headers),
  })

  return NextResponse.json({ data: updatedLead })
}
