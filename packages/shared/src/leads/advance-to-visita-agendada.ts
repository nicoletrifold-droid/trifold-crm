import { STAGE_IDS } from "../constants/stages"

/**
 * Etapas POSTERIORES a "Visita Agendada" — daqui um agendamento nunca regride
 * o lead (quem já visitou, propôs, negocia ou fechou não volta para trás).
 *
 * 🔴 Story 75-340: antes desta story a regra era o INVERSO — uma allowlist
 * (`novo`, `em_qualificacao`, `qualificado`, `no_show`). Toda etapa fora dela
 * ficava parada: lead vindo de `importar_crm`, de `acao_muffato`, de
 * `represamento` ou marcado como `perdido` agendava a visita e continuava na
 * etapa antiga — foi assim que o "Lucas Teste" agendou pelo formulário e não
 * apareceu em Visita Agendada. Allowlist erra em silêncio a cada etapa nova
 * criada no kanban; blocklist erra do lado seguro (avança).
 *
 * Decisão do diretor (18/08): agendou visita → a etapa é Visita Agendada,
 * inclusive reativando lead perdido. Ver `lost_reason` abaixo.
 */
export const VISITA_AGENDADA_NAO_REGRIDE = [
  STAGE_IDS.visitou,
  STAGE_IDS.proposta,
  STAGE_IDS.negociando,
  STAGE_IDS.fechou,
] as const

type StageUpdateResult = { error: { message: string } | null }

interface StageFilterBuilder extends PromiseLike<StageUpdateResult> {
  eq(column: string, value: string): StageFilterBuilder
  or(filters: string): StageFilterBuilder
}

/** Payload do update — `lost_reason`/`lost_reason_grupo` zerados na reativação. */
export interface VisitaAgendadaUpdate {
  stage_id: string
  lost_reason: null
  lost_reason_grupo: null
}

/** Sub-conjunto estrutural do SupabaseClient — o shared não depende de supabase-js. */
export interface StageAdvanceClient {
  from(table: string): {
    update(values: VisitaAgendadaUpdate): StageFilterBuilder
  }
}

/**
 * Move o lead para "Visita Agendada" com guard só-não-regride (Story 75-340,
 * revisando a 75-196).
 *
 * O filtro vive no WHERE do UPDATE (não é read-then-write) para não atropelar um
 * movimento concorrente do corretor: só afeta a linha cuja etapa atual é NULL ou
 * NÃO está em VISITA_AGENDADA_NAO_REGRIDE.
 *
 * `lost_reason` e `lost_reason_grupo` são LIMPOS junto: um lead que acabou de
 * marcar visita não é um lead perdido, e o Pipeline (inclusive o IMOB) filtra
 * `lost_reason IS NULL` — sem limpar, o lead entraria na etapa e continuaria
 * invisível no quadro. Quem chama registra a activity `lead_reactivated`
 * quando o lead vinha de Perdido (ver `lib/leads/advance-visita-agendada.ts`).
 *
 * Nunca toca `segmento`: lead imob segue no pipeline IMOB (mesmas etapas,
 * filtradas por segmento), principal no HOUSE.
 */
export async function advanceToVisitaAgendada(
  supabase: StageAdvanceClient,
  leadId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("leads")
    .update({
      stage_id: STAGE_IDS.visita_agendada,
      lost_reason: null,
      lost_reason_grupo: null,
    })
    .eq("id", leadId)
    .or(`stage_id.is.null,stage_id.not.in.(${VISITA_AGENDADA_NAO_REGRIDE.join(",")})`)

  return { error: error?.message ?? null }
}
