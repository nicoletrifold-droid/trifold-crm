import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { LOST_REASON_GROUP_LABELS, isLostReasonGrupo } from "@web/lib/constants"

// (Corrigido na 75-264: a constante se chamava REPRESAMENTO_STAGE mas o valor
// sempre foi a etapa Perdido — represamento é …0010.)
const PERDIDO_STAGE = "00000000-0000-0000-0001-000000000008"
const NAO_QUALIFICADO_STAGE = "95327bd7-3e88-4038-aa16-250a74ab085c"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getServerUser()
  const supabase = await createClient()
  const body = (await req.json()) as {
    reason?: string
    type?: "represamento" | "nao_qualificado"
    grupo?: string
  }

  // Story 75-264 — o motivo estruturado é obrigatório e validado server-side
  // (texto livre puro por API é a origem das 614 variantes em prod).
  if (!isLostReasonGrupo(body.grupo)) {
    return NextResponse.json(
      { error: "grupo é obrigatório (motivo de perda estruturado)" },
      { status: 400 }
    )
  }
  const grupo = body.grupo
  // A observação livre PERMANECE ao lado do grupo. Sem observação, grava o
  // rótulo do grupo: o analytics conta "perdido" pela presença de lost_reason
  // (get_analytics_summary* / executive.ts) — NULL sumiria da contagem.
  const reason = body.reason?.trim() || LOST_REASON_GROUP_LABELS[grupo]
  const type = body.type === "nao_qualificado" ? "nao_qualificado" : "represamento"
  const stageId = body.type === "nao_qualificado" ? NAO_QUALIFICADO_STAGE : PERDIDO_STAGE

  // Snapshot do nome do lead ANTES do update — necessário para o audit log
  const { data: leadSnapshot } = await supabase
    .from("leads")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle()

  // 1. Atualiza stage e lost_reason
  const { error: updateErr } = await supabase
    .from("leads")
    .update({
      stage_id: stageId,
      lost_reason: reason,
      lost_reason_grupo: grupo,
    })
    .eq("id", id)
    .eq("org_id", user.orgId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 2. Cancela tarefas pendentes
  await supabase
    .from("lead_tasks")
    .update({ completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("lead_id", id)
    .eq("org_id", user.orgId)
    .is("completed_at", null)

  // 3. Registra atividade
  await supabase.from("activities").insert({
    org_id: user.orgId,
    lead_id: id,
    user_id: user.id,
    type: "lead_lost",
    description: reason || "Lead marcado como perdido",
  })

  void logAudit({
    org_id: user.orgId,
    user_id: user.id,
    user_name: user.name,
    action: "lead.mark_lost",
    entity_type: "lead",
    entity_id: id,
    entity_name: leadSnapshot?.name ?? id,
    metadata: { reason, grupo, type },
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ ok: true })
}
