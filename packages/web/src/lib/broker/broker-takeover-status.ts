/**
 * Story 63-8 (Epic 63) — Derivação do estado de takeover do atendimento.
 *
 * Helper puro (sem React/DOM) que deriva se o corretor assumiu o atendimento a
 * partir das mensagens já carregadas no `ConversationThread`. Usado pelo banner
 * read-only `AiStatusBanner` para distinguir "Nicole atendendo" de "Você está
 * no atendimento".
 *
 * Fonte de verdade do takeover (NÃO é `is_ai_active`): a mesma usada pelo cron
 * de follow-up — presença de mensagem `role='broker'` nas últimas 24h
 * (`brokerSentRecently`). Conforme `send-message/route.ts` (L15-28), o envio do
 * corretor NÃO desliga `is_ai_active`; o takeover é implícito via janela de 24h.
 * Por isso `is_ai_active` entra apenas como sinal secundário (handoff de admin).
 *
 * `is_ai_active=false` (handoff manual por admin/supervisor) também conta como
 * corretor/humano no atendimento.
 *
 * Função pura e determinística (com `now` injetável) para ser testável em
 * ambiente Node (Vitest), no mesmo padrão de `window-status.ts`.
 */

/** Subconjunto de `ThreadMessage` necessário para a derivação. */
export interface TakeoverMessage {
  role: string
  created_at: string
}

/** Janela de takeover implícito: 24h (mesma janela do cron de follow-up). */
export const BROKER_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * `true` se há uma mensagem `role='broker'` nas últimas 24h (takeover implícito).
 *
 * @param messages Lista de mensagens da conversa (já carregadas no thread).
 * @param now      Instante de referência (default: agora). Injetável para teste.
 */
export function brokerSentRecently(
  messages: readonly TakeoverMessage[],
  now: number = Date.now()
): boolean {
  return messages.some(
    (m) =>
      m.role === "broker" &&
      now - new Date(m.created_at).getTime() < BROKER_WINDOW_MS
  )
}

/**
 * `true` quando o corretor/humano está no atendimento — seja por envio recente
 * (`brokerSentRecently`, takeover implícito) ou por handoff manual de admin
 * (`isAiActive=false`). `false` significa "Nicole atendendo automaticamente".
 *
 * @param messages   Lista de mensagens da conversa.
 * @param isAiActive Valor de `conversations.is_ai_active`.
 * @param now        Instante de referência (default: agora). Injetável para teste.
 */
export function deriveBrokerActive(
  messages: readonly TakeoverMessage[],
  isAiActive: boolean,
  now: number = Date.now()
): boolean {
  return brokerSentRecently(messages, now) || !isAiActive
}
