/**
 * Regras de stage do kanban controladas pela Nicole.
 */

/**
 * Regra interna (Story 65-1): um lead já distribuído a um corretor permanece
 * em "Aguardando atendimento". A Nicole NUNCA reposiciona no kanban um lead que
 * já tem dono — qualificação por score, visita agendada e handoff não movem o
 * stage. Apenas o corretor humano muda de coluna.
 *
 * Remove (in-place) o `stage_id` do patch quando o lead já está atribuído.
 * Demais campos do patch (score, dados, ai_summary) seguem normalmente.
 *
 * @param leadPatch        patch acumulado que será aplicado em `leads`
 * @param assignedBrokerId dono atual do lead (estado ANTES desta execução)
 */
export function guardStageForAssignedLead(
  leadPatch: Record<string, unknown>,
  assignedBrokerId: string | null | undefined
): void {
  if (assignedBrokerId && "stage_id" in leadPatch) {
    delete leadPatch.stage_id
  }
}
