import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 63-16 (Epic 63 Fase 6) — Helpers de contagem de mensagens não-lidas
 * do corretor.
 *
 * Definição de "não-lida": mensagem com `role = 'user'` (do lead — nunca do
 * corretor nem da Nicole) cujo `created_at` é posterior ao
 * `conversations.broker_last_read_at` da respectiva conversa. Se
 * `broker_last_read_at` é `null` (nunca lida), TODAS as mensagens `role='user'`
 * contam.
 *
 * - `countUnreadForLead` — função PURA (sem dependências externas), usada tanto
 *   para o total de um lead (várias conversas) quanto por card da inbox (passar
 *   uma única conversa no array `convs`).
 * - `getBrokerUnreadTotal` — wrapper server-side da RPC `get_broker_unread_total`.
 */

export interface UnreadConv {
  id: string
  broker_last_read_at: string | null
}

export interface UnreadMsg {
  conversation_id: string
  role: string
  created_at: string
}

/**
 * Conta mensagens não-lidas (`role='user'`, `created_at > broker_last_read_at`)
 * das conversas em `convs`. Mensagens de conversas fora de `convs` são ignoradas.
 *
 * - `broker_last_read_at` nulo OU com data inválida → conversa nunca lida: todas
 *   as mensagens `role='user'` daquela conversa contam.
 * - Mensagem com `created_at` inválido é ignorada (nunca conta).
 * - Mensagens `role` diferente de `'user'` (ex.: `'broker'`, `'assistant'`)
 *   nunca contam, independentemente do timestamp.
 */
export function countUnreadForLead(convs: UnreadConv[], msgs: UnreadMsg[]): number {
  // Map conversationId -> cutoff em ms (null = nunca lida, tudo conta).
  const cutoffByConv = new Map<string, number | null>()
  for (const c of convs) {
    const parsed = c.broker_last_read_at ? Date.parse(c.broker_last_read_at) : NaN
    cutoffByConv.set(c.id, Number.isNaN(parsed) ? null : parsed)
  }

  let count = 0
  for (const m of msgs) {
    if (m.role !== "user") continue
    if (!cutoffByConv.has(m.conversation_id)) continue

    const cutoff = cutoffByConv.get(m.conversation_id) ?? null
    if (cutoff === null) {
      // Conversa nunca lida → toda mensagem do lead conta.
      count++
      continue
    }

    const created = Date.parse(m.created_at)
    if (Number.isNaN(created)) continue
    if (created > cutoff) count++
  }

  return count
}

/**
 * Total de conversas com >= 1 mensagem não-lida do corretor logado, via RPC
 * `get_broker_unread_total` (SECURITY INVOKER — RLS aplica naturalmente).
 * Retorna 0 em caso de erro (best-effort para não derrubar o layout).
 */
export async function getBrokerUnreadTotal(
  supabase: SupabaseClient,
  orgId: string,
  brokerId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("get_broker_unread_total", {
    p_org_id: orgId,
    p_broker_user_id: brokerId,
  })
  if (error) return 0
  return Number(data ?? 0)
}
