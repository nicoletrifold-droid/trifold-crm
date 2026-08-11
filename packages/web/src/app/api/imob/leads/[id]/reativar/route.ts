import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"
import { logAudit, getRequestIp } from "@web/lib/audit"
import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"
import { STAGE_IDS } from "@trifold/shared"

// POST /api/imob/leads/[id]/reativar — Story 75-297: reativa um lead PERDIDO do mundo IMOB.
//
// Irmão do endpoint house (/api/leads/[id]/reativar), mas no padrão IMOB: o gate é
// imobGuard (canAccess "imob"), não role de gestor — quem tem o módulo gerencia os leads
// dele (mesma fronteira do assign). E o mundo IMOB não tem roleta, SLA, bolsão nem conversa
// da Nicole (leads manuais, fora da roleta desde a 75-99), então reativar aqui é só: voltar
// para "Aguardando atendimento", limpar o motivo de perda e definir o responsável.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as
    | { broker_id?: string; motivo?: string }
    | null
  const brokerId = body?.broker_id?.trim()
  const motivo = body?.motivo?.trim()
  if (!brokerId) return NextResponse.json({ error: "Selecione o responsável." }, { status: 400 })
  if (!motivo) return NextResponse.json({ error: "O motivo da reativação é obrigatório." }, { status: 400 })

  // O lead precisa existir, ser do mundo IMOB e da mesma org (impede tocar no funil principal).
  const { data: lead } = await admin
    .from("leads")
    .select("id, segmento, name, stage_id, assigned_broker_id, lost_reason, lost_reason_grupo")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .maybeSingle()
  if (!lead || (lead as { segmento: string }).segmento !== "imob") {
    return NextResponse.json({ error: "Lead IMOB não encontrado" }, { status: 404 })
  }
  if (!PERDIDO_STAGE_IDS.includes((lead as { stage_id: string }).stage_id)) {
    return NextResponse.json({ error: "Este lead não está perdido." }, { status: 422 })
  }

  // Responsável: mesma régua do assign — qualquer usuário interno ativo da org.
  const { data: u } = await admin
    .from("users")
    .select("id, name, role, is_active")
    .eq("id", brokerId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  const target = u as { id: string; name: string | null; role: string; is_active: boolean } | null
  if (!target || !target.is_active || target.role === "cliente") {
    return NextResponse.json({ error: "Usuário inválido para responsável" }, { status: 400 })
  }

  const previous = lead as {
    name: string | null
    assigned_broker_id: string | null
    lost_reason: string | null
    lost_reason_grupo: string | null
  }

  const { error: updateErr } = await admin
    .from("leads")
    .update({
      stage_id: STAGE_IDS.novo, // volta para "Aguardando atendimento", a etapa de entrada do IMOB
      assigned_broker_id: brokerId,
      lost_reason: null,
      lost_reason_grupo: null, // Story 75-264: grupo não pode ficar residual
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Mesmo type da house: o timeline já renderiza "Lead reativado" + motivo.
  await admin.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "lead_reactivated",
    description: `Lead reativado para ${target.name ?? "responsável"} (IMOB)`,
    metadata: {
      motivo,
      imob: true,
      to_broker_id: brokerId,
      from_broker_id: previous.assigned_broker_id,
      previous_lost_reason: previous.lost_reason ?? null,
      previous_lost_reason_grupo: previous.lost_reason_grupo ?? null,
    },
  })

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.reactivate",
    entity_type: "lead",
    entity_id: id,
    entity_name: previous.name ?? id,
    metadata: { motivo, imob: true, to_broker_id: brokerId, previous_lost_reason: previous.lost_reason ?? null, previous_lost_reason_grupo: previous.lost_reason_grupo ?? null },
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ ok: true })
}
