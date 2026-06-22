/**
 * Story 63-8 (Epic 63) — Derivação do estado de takeover do atendimento.
 *
 * Helper puro (sem React/DOM) que deriva se o corretor assumiu o atendimento a
 * partir das mensagens já carregadas no `ConversationThread`. Usado pelo banner
 * read-only `AiStatusBanner` para distinguir "Nicole atendendo" de "Você está
 * no atendimento".
 *
 * Fonte de verdade do takeover: `conversations.is_ai_active` (explícito, via
 * Story 63-13) — false quando o corretor enviou; true quando a Nicole está ativa.
 * `brokerSentRecently` permanece como sinal COMPLEMENTAR: race conditions,
 * primeira carga antes da hidratação de state, e edge cases de transição.
 * `deriveBrokerActive = brokerSentRecently || !isAiActive` captura ambos.
 *
 * `is_ai_active=false` (handoff explícito por envio do corretor — 63-13 — ou
 * handoff manual por admin/supervisor) também conta como corretor/humano no
 * atendimento.
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

/**
 * Story 63-13 — Decide se a Nicole deve reassumir automaticamente um lead cuja
 * conversa está com `is_ai_active=false` (corretor assumiu via handoff). Usado
 * no webhook (`webhook/whatsapp/route.ts`) quando o lead envia uma nova mensagem.
 *
 * Reativa quando o corretor está inativo há ≥ 24h (`BROKER_WINDOW_MS`):
 * - `lastBrokerAt === null` → nunca houve mensagem `role='broker'` → reassume.
 * - última msg `role='broker'` há ≥ 24h → corretor inativo → reassume.
 * - última msg `role='broker'` há < 24h → corretor ativo → NÃO reassume (silente).
 *
 * Helper puro e determinístico (com `now` injetável) — mesma fonte de janela
 * (`BROKER_WINDOW_MS`) de `brokerSentRecently` para consistência. O limiar usa
 * `>=` (espelho do `<` estritamente menor de `brokerSentRecently`): em exatamente
 * 24h o corretor deixa de ser "recente" e a Nicole reassume.
 *
 * Robustez: `lastBrokerAt` inválido (NaN) → `now - NaN` é NaN, `NaN >= WINDOW` é
 * false → NÃO reassume (conservador: mantém o corretor no controle).
 *
 * @param lastBrokerAt `created_at` da última msg `role='broker'`, ou `null`.
 * @param now          Instante de referência (default: agora). Injetável p/ teste.
 */
export function shouldReactivateAi(
  lastBrokerAt: string | null,
  now: number = Date.now()
): boolean {
  if (!lastBrokerAt) return true
  return now - new Date(lastBrokerAt).getTime() >= BROKER_WINDOW_MS
}

/**
 * Story 63-15 — Resolve a "âncora" de atividade humana de uma conversa em handoff,
 * para alimentar `shouldReactivateAi`. É o instante MAIS RECENTE entre:
 * - `handoffAt`: `conversations.handoff_at` (momento do handoff — por envio do
 *   corretor, `handoff_reason='broker_reply'`, OU por agendamento da Nicole,
 *   `handoff_reason='appointment'`).
 * - `lastBrokerAt`: `created_at` da última mensagem `role='broker'`.
 *
 * Usar o máximo dos dois unifica os dois gatilhos de handoff:
 * - Handoff por agendamento (sem msg de corretor) → âncora = `handoffAt` → a Nicole
 *   só reassume 24h após o agendamento (sem isso, `lastBrokerAt=null` reativaria
 *   na mensagem seguinte e anularia o handoff).
 * - Corretor respondendo por vários dias → âncora = `lastBrokerAt` (mais recente
 *   que o `handoffAt` inicial) → a Nicole não reassume enquanto ele está ativo.
 *
 * Retorna o timestamp ISO mais recente, ou `null` se ambos forem nulos (caso em
 * que `shouldReactivateAi(null)` reativa — não há sinal de humano no atendimento).
 *
 * @param handoffAt    `conversations.handoff_at`, ou `null`.
 * @param lastBrokerAt `created_at` da última msg `role='broker'`, ou `null`.
 */
export function resolveTakeoverAnchor(
  handoffAt: string | null,
  lastBrokerAt: string | null
): string | null {
  if (!handoffAt) return lastBrokerAt
  if (!lastBrokerAt) return handoffAt
  return new Date(handoffAt).getTime() >= new Date(lastBrokerAt).getTime()
    ? handoffAt
    : lastBrokerAt
}
