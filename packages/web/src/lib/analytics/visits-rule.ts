/**
 * Story 75-322 — regra ÚNICA de "visita realizada" no Analytics.
 *
 * Antes existiam duas, e elas discordavam. Medido em prod na janela 09→16/08/2026:
 *
 *   tela  (`/api/analytics/executive`): status = 'completed' + team = 'house'  → 3
 *   PDF   (`analytics-report-data.ts`): status NOT IN (cancelled, no_show)     → 4
 *
 * As duas diferenças do PDF eram silenciosas e ambas contavam a mais: `scheduled` e
 * `confirmed` (visita que ainda não aconteceu) entravam como realizadas, e a falta do
 * filtro de `team` trazia a agenda do IMOB — que o Analytics principal exclui em todo
 * o resto (Story 75-98 / Epic 81). A quarta "visita realizada" do PDF naquela janela
 * era, literalmente, um compromisso do IMOB ainda por acontecer.
 *
 * Aqui mora a regra e nada mais. Quem precisa de "visita realizada" importa daqui —
 * tela, PDF e relatório semanal — para que divergir volte a ser impossível, e não
 * apenas improvável.
 */

/** Equipe cujos compromissos entram no Analytics principal (IMOB fica fora). */
export const ANALYTICS_APPOINTMENT_TEAM = "house"

/** Único status que significa "a visita aconteceu". Ver Story 75-321 para o porquê
 *  de `closed` existir e não contar: encerrado sem confirmação de presença. */
export const REALIZED_VISIT_STATUS = "completed"

/** Decisão pura — usada na classificação em memória (`buildVisits`). */
export function isRealizedVisit(status: string): boolean {
  return status === REALIZED_VISIT_STATUS
}

/** Encadeamento mínimo de `.eq()` — o que este helper precisa de uma query. */
interface EqChain {
  eq(column: string, value: string): EqChain
}

/**
 * Aplica a regra a uma query PostgREST de `appointments`, devolvendo a própria query
 * para seguir encadeando/aguardando.
 *
 * O genérico é DELIBERADAMENTE irrestrito e a ponte é um cast: restringir `T` a algo
 * com `.eq()` faz o compilador tentar instanciar o tipo recursivo do builder do
 * supabase-js e estourar em TS2589 ("type instantiation is excessively deep"). Mesmo
 * padrão já usado em `fetch-all-leads.ts` com `RangeableQuery`.
 */
export function applyRealizedVisitFilter<T>(query: T): T {
  return (query as EqChain)
    .eq("status", REALIZED_VISIT_STATUS)
    .eq("team", ANALYTICS_APPOINTMENT_TEAM) as unknown as T
}
