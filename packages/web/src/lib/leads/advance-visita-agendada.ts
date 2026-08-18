import { advanceToVisitaAgendada, VISITA_AGENDADA_NAO_REGRIDE } from "@trifold/shared"
import type { SupabaseClient } from "@supabase/supabase-js"
import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"

// Story 75-340 — "agendou visita → etapa Visita Agendada", inclusive quando o
// lead estava PERDIDO.
//
// O guard em si mora no `advanceToVisitaAgendada` do shared (WHERE do UPDATE, à
// prova de corrida). O que este arquivo acrescenta é a TRILHA: um lead que sai
// de Perdido/Não Qualificado precisa de activity `lead_reactivated`, senão a
// timeline mostra o lead mudando de etapa sozinho — e ninguém consegue explicar
// depois por que um lead perdido voltou ao funil.
//
// A leitura antes do update é só para essa trilha; ela NÃO é o guard (não é
// read-then-write). Se a etapa mudar entre a leitura e o UPDATE, o WHERE decide
// e o pior caso é uma activity a mais ou a menos — nunca uma etapa errada.

interface Opcoes {
  orgId: string
  leadId: string
  /** Quem/o quê disparou — vai na descrição da activity. Ex.: 'formulário "Investimento Maringá"'. */
  origem: string
  /** Usuário responsável, quando a visita foi criada de dentro do CRM. */
  userId?: string | null
}

/**
 * Move o lead para "Visita Agendada" e, se ele vinha de Perdido, registra a
 * reativação. Devolve `{ error, reativado }` — `reativado` é informativo.
 */
export async function advanceVisitaAgendadaComTrilha(
  admin: SupabaseClient,
  { orgId, leadId, origem, userId = null }: Opcoes
): Promise<{ error: string | null; reativado: boolean }> {
  const { data: antes } = await admin
    .from("leads")
    .select("stage_id, lost_reason, lost_reason_grupo")
    .eq("id", leadId)
    .maybeSingle()

  const stageAnterior = (antes?.stage_id as string | null) ?? null
  const lostReasonAnterior = (antes?.lost_reason as string | null) ?? null

  const { error } = await advanceToVisitaAgendada(admin as never, leadId)
  if (error) return { error, reativado: false }

  // "Perdido" é ETAPA (convenção 75-153), mas `lost_reason` preenchido em etapa
  // ativa também tira o lead dos quadros — os dois casos são reativação.
  const estavaPerdido =
    (stageAnterior !== null && PERDIDO_STAGE_IDS.includes(stageAnterior)) || lostReasonAnterior !== null
  const regrediria = stageAnterior !== null && VISITA_AGENDADA_NAO_REGRIDE.includes(stageAnterior as never)
  const reativado = estavaPerdido && !regrediria

  if (reativado) {
    await admin.from("activities").insert({
      org_id: orgId,
      lead_id: leadId,
      user_id: userId,
      type: "lead_reactivated",
      description: `Lead reativado automaticamente: visita agendada via ${origem}`,
      metadata: {
        motivo: `Visita agendada via ${origem}`,
        automatico: true,
        previous_stage_id: stageAnterior,
        previous_lost_reason: lostReasonAnterior,
        previous_lost_reason_grupo: (antes?.lost_reason_grupo as string | null) ?? null,
      },
    })
  }

  return { error: null, reativado }
}
