/**
 * Regras de stage do kanban controladas pela Nicole.
 */

/**
 * Regra interna (Story 75-56, generaliza a 65-1): a Nicole NUNCA reposiciona um
 * lead no kanban via patch — nem por score, nem por handoff, com ou sem corretor
 * atribuído. Apenas o corretor humano muda de coluna; a roleta seta "Aguardando
 * atendimento" na distribuição. EXCEÇÃO (Story 75-196): agendar/remarcar visita
 * avança o lead para "Visita Agendada" — mas por update direto via
 * advanceToVisitaAgendada (@trifold/shared, guard só-avança), nunca pelo patch.
 *
 * Remove (in-place) e INCONDICIONALMENTE o `stage_id` do patch da IA. Demais
 * campos do patch (score, dados, ai_summary) seguem normalmente.
 *
 * @param leadPatch        patch acumulado que será aplicado em `leads`
 * @param assignedBrokerId dono atual do lead — mantido por compatibilidade do
 *                         call-site; não altera mais o comportamento.
 */
export function guardStageForAssignedLead(
  leadPatch: Record<string, unknown>,
  _assignedBrokerId?: string | null | undefined
): void {
  if ("stage_id" in leadPatch) {
    delete leadPatch.stage_id
  }
}
