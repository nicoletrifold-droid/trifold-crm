/**
 * Story 63-5 (Epic 63) — Helper puro do `ConversationThread`.
 *
 * Mescla as mensagens vindas do servidor (Server Component → prop `messages`)
 * com as mensagens otimistas geradas localmente pelo `BrokerMessageInput`
 * (via callback `onSent`). Mantém uma única lista renderizável.
 *
 * Regra de deduplicação: após `router.refresh()`, o servidor passa a devolver a
 * mensagem recém-enviada com o MESMO id (`data.messageId`) usado na mensagem
 * otimista. Para evitar bolhas duplicadas, qualquer mensagem otimista cujo id
 * já apareça na lista do servidor é descartada.
 *
 * Função pura (sem React/DOM) para ser testável em ambiente Node (Vitest).
 */

import type { OptimisticMessage } from "./broker-message-input"

export interface ThreadMessage {
  id: string
  role: string
  content: string
  created_at: string
  metadata?: Record<string, unknown> | null
}

export function mergeMessages(
  server: ThreadMessage[],
  optimistic: OptimisticMessage[]
): ThreadMessage[] {
  const serverIds = new Set(server.map((m) => m.id))
  const pending: ThreadMessage[] = optimistic
    .filter((o) => !serverIds.has(o.id))
    .map((o) => ({
      id: o.id,
      role: o.role,
      content: o.content,
      created_at: o.created_at,
    }))
  return [...server, ...pending]
}
