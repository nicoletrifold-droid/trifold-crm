/**
 * Chave de dedup do LEMBRETE de boleto (cron boleto-scan, Story 75-141/147).
 *
 * DEVE incluir o `userId`. Sem ele (bug corrigido na Story 75-145-b), o claim em
 * `sienge_webhook_dedup` colidia entre CLIENTES da mesma obra+vencimento — como
 * parcelas costumam vencer no mesmo dia para todos, só o 1º cliente processado
 * recebia o lembrete e os demais eram silenciosamente pulados.
 *
 * A intenção sempre foi "1 mensagem por cliente+obra+marco/dia" (Story 75-147) —
 * este é exatamente o nível de unicidade da chave.
 */
export function lembreteEventKey(
  marco: string,
  obraId: string,
  userId: string,
  dueKey: string
): string {
  return `${marco}:${obraId}:${userId}:${dueKey}`
}
