// Story 75-267 — distingue "nunca teve conversa" (a abertura via template é a
// ação primária; a copy convida a INICIAR o atendimento) de "janela de 24h
// fechada" (teve conversa e expirou; aguardar o lead ou reabrir por template).
//
// Helper puro compartilhado pelo ConversationThread (thread completa +
// last_message_at) e pelo drawer do lead (mensagens da conversa mais recente).

/**
 * `true` quando o lead nunca teve conversa: nenhuma mensagem registrada E
 * nenhum `conversations.last_message_at`. Qualquer um dos dois sinais presente
 * significa que já houve contato — aí o estado é "janela fechada", não
 * "sem conversa".
 */
export function neverHadConversation(
  messageCount: number,
  lastMessageAt: Date | null
): boolean {
  return messageCount === 0 && lastMessageAt === null
}
