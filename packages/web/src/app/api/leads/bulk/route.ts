import { NextRequest, NextResponse } from "next/server"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"
import { getServerUser } from "@web/lib/auth"
import { can } from "@web/lib/permissions"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { STAGE_IDS } from "@trifold/shared"
import { LOST_REASON_GROUP_LABELS, isLostReasonGrupo } from "@web/lib/constants"

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  // 75-311: ações em massa = capability própria (morre o proxy canAccess("sistema")).
  const allowed = await can(user.id, user.orgId, "leads.acoes_em_massa")
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { lead_ids, broker_id, lost_reason, lost_reason_grupo, roleta } = body as {
    lead_ids: string[]
    broker_id?: string | null
    lost_reason?: string | null
    lost_reason_grupo?: string | null
    roleta?: boolean
  }

  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return NextResponse.json({ error: "lead_ids obrigatório" }, { status: 400 })
  }

  // Story 75-264 — validação server-side do grupo: este endpoint usa service_role,
  // nenhuma RLS barra valor inválido aqui; só a whitelist (e o CHECK do banco).
  if ((lost_reason || lost_reason_grupo) && !isLostReasonGrupo(lost_reason_grupo)) {
    return NextResponse.json(
      { error: "lost_reason_grupo é obrigatório para finalizar como perdido" },
      { status: 400 }
    )
  }

  const supabase = createOrgScopedAdminClient(user.orgId)
  const now = new Date().toISOString()

  // Montar payload de atualização
  const update: Record<string, unknown> = { updated_at: now }

  if (broker_id !== undefined) {
    update.assigned_broker_id = broker_id || null
    // Transferência de corretor → o lead volta para "Aguardando atendimento"
    // (STAGE_IDS.novo), independente do estágio em que estava com o corretor anterior.
    update.stage_id = STAGE_IDS.novo
    // Se o lead estava Perdido, ao voltar para etapa ativa não pode carregar lost_reason
    // residual (senão some do pipeline / fica read-only). Convenção: "perdido = ETAPA".
    update.lost_reason = null
    update.lost_reason_grupo = null
  }

  // Story 75-207 — "Voltar para a Roleta": limpa o corretor E o bolsão (senão a
  // roleta recusa com em_bolsao) e, após o update, dispara a redistribuição na
  // hora. Se estiver fora de horário/sem corretor disponível, o lead fica sem
  // corretor e o cron roleta-retry (*/3) assume.
  if (roleta) {
    update.assigned_broker_id = null
    update.bolsao_em = null
    update.stage_id = STAGE_IDS.novo
    update.lost_reason = null
    update.lost_reason_grupo = null
  }

  if (lost_reason_grupo && isLostReasonGrupo(lost_reason_grupo)) {
    // Story 75-264: grupo estruturado + observação livre ao lado. Sem observação,
    // grava o rótulo do grupo — o analytics conta "perdido" pela presença de
    // lost_reason (get_analytics_summary* / executive.ts).
    update.lost_reason_grupo = lost_reason_grupo
    update.lost_reason = lost_reason?.trim() || LOST_REASON_GROUP_LABELS[lost_reason_grupo]
    update.stage_id = STAGE_IDS.perdido // finalizar como perdido prevalece sobre a transferência
  }

  const { error, count } = await supabase
    .from("leads")
    .update(update)
    .eq("org_id", user.orgId)
    .in("id", lead_ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Story 75-207: auditoria + redistribuição imediata, lead a lead (sequencial
  // para respeitar a ordem da roleta). Falha de um não derruba os demais.
  let distributed = 0
  if (roleta) {
    await supabase.from("activities").insert(
      lead_ids.map((leadId) => ({
        org_id: user.orgId,
        lead_id: leadId,
        user_id: user.id,
        type: "transfer",
        description: `Lead devolvido à Roleta por ${user.name}.`,
        metadata: { acao: "voltar_roleta" },
      }))
    )
    for (const leadId of lead_ids) {
      try {
        const result = await distributeLeadToNextBroker(leadId, user.orgId)
        if (result.status === "distributed") distributed++
      } catch {
        // fica sem corretor; cron roleta-retry assume
      }
    }
  }

  return NextResponse.json({ updated: count ?? lead_ids.length, ...(roleta ? { distributed } : {}) })
}
