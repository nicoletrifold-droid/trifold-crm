/**
 * Story 63-11 (Epic 63) — Helpers puros para a atualização em tempo real do
 * `ConversationThread`.
 *
 * A subscription Supabase Realtime adiciona mensagens novas a um state local
 * (`realtimeMessages`). Estas funções combinam essa lista com as mensagens do
 * servidor (prop `messages`) sem gerar bolhas/keys duplicadas e fazem a limpeza
 * das mensagens que já foram incorporadas pelo `router.refresh()`.
 *
 * Por que não estender `mergeMessages` (conversation-thread-merge.ts): aquele
 * helper deduplica apenas otimistas contra o servidor — não remove duplicatas
 * DENTRO da lista do servidor. Quando o INSERT do próprio corretor chega via
 * realtime e, logo depois, o `router.refresh()` traz a mesma mensagem em
 * `messages`, há um frame em que o mesmo `id` aparece nas duas listas. Sem
 * deduplicação por id, o React renderiza duas bolhas com a MESMA `key`. Estes
 * helpers garantem uma única ocorrência por id (a do servidor prevalece).
 *
 * Funções puras (sem React/DOM) para serem testáveis em ambiente Node (Vitest).
 */

import type { ThreadMessage } from "./conversation-thread-merge"

/**
 * Remove duplicatas por `id` preservando a ordem — a PRIMEIRA ocorrência vence.
 *
 * Uso: `dedupeById([...messages, ...realtimeMessages])` faz a mensagem do
 * servidor (que vem antes) prevalecer sobre a cópia realtime do mesmo id.
 */
export function dedupeById(messages: ThreadMessage[]): ThreadMessage[] {
  const seen = new Set<string>()
  const out: ThreadMessage[] = []
  for (const m of messages) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}

/**
 * Remove de `realtime` as mensagens cujo `id` já está presente em `server`.
 *
 * Usado no `useEffect([messages])`: depois que o `router.refresh()` incorpora
 * uma mensagem que havia chegado via realtime, ela deve sair de
 * `realtimeMessages` para que a fonte-de-verdade volte a ser o servidor.
 */
export function pruneRealtime(
  realtime: ThreadMessage[],
  server: ThreadMessage[]
): ThreadMessage[] {
  if (realtime.length === 0) return realtime
  const serverIds = new Set(server.map((m) => m.id))
  return realtime.filter((m) => !serverIds.has(m.id))
}

/**
 * `true` quando há ao menos uma mensagem de `realtime` ainda não presente em
 * `server` — ou seja, `pruneRealtime` produziria uma lista menor. Permite ao
 * componente evitar `setState` (e re-render) desnecessário quando nada mudou.
 */
export function hasStaleRealtime(
  realtime: ThreadMessage[],
  server: ThreadMessage[]
): boolean {
  if (realtime.length === 0) return false
  const serverIds = new Set(server.map((m) => m.id))
  return realtime.some((m) => serverIds.has(m.id))
}
