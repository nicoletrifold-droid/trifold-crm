import { STAGE_IDS } from "../constants/stages"

/**
 * Etapas a partir das quais um agendamento de visita pode AVANÇAR o lead para
 * "Visita Agendada" (Story 75-196). `no_show` entra de propósito: remarcou →
 * volta para Visita Agendada. Etapas posteriores (visitou, proposta, negociando,
 * fechou…) nunca regridem, e `perdido` é terminal para automação (Story 75-118).
 */
export const VISITA_AGENDADA_ADVANCE_FROM = [
  STAGE_IDS.novo,
  STAGE_IDS.em_qualificacao,
  STAGE_IDS.qualificado,
  STAGE_IDS.no_show,
] as const

type StageUpdateResult = { error: { message: string } | null }

interface StageFilterBuilder extends PromiseLike<StageUpdateResult> {
  eq(column: string, value: string): StageFilterBuilder
  is(column: string, value: null): StageFilterBuilder
  or(filters: string): StageFilterBuilder
}

/** Sub-conjunto estrutural do SupabaseClient — o shared não depende de supabase-js. */
export interface StageAdvanceClient {
  from(table: string): {
    update(values: { stage_id: string }): StageFilterBuilder
  }
}

/**
 * Move o lead para "Visita Agendada" com guard só-avança (Story 75-196).
 *
 * O filtro vive no WHERE do UPDATE (não é read-then-write) para não atropelar um
 * movimento concorrente do corretor: só afeta a linha se `lost_reason IS NULL` e
 * a etapa atual for NULL ou uma das VISITA_AGENDADA_ADVANCE_FROM. Nunca toca
 * `segmento` — lead imob segue no pipeline IMOB, principal no HOUSE.
 */
export async function advanceToVisitaAgendada(
  supabase: StageAdvanceClient,
  leadId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("leads")
    .update({ stage_id: STAGE_IDS.visita_agendada })
    .eq("id", leadId)
    .is("lost_reason", null)
    .or(`stage_id.is.null,stage_id.in.(${VISITA_AGENDADA_ADVANCE_FROM.join(",")})`)

  return { error: error?.message ?? null }
}
