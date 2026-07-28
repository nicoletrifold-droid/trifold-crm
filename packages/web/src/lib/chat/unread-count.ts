import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-223 — contagem de conversas de relacionamento não lidas.
 * Regra única (Story 75-86): conversa is_relationship com ≥1 mensagem do
 * cliente (role='user') criada após broker_last_read_at (ou nunca lida).
 * Usada pelo badge do menu (layout), pela rota /api/chat/unread-count e
 * espelha a marcação da lista em /dashboard/chat.
 */

export interface RelationshipConversation {
  id: string
  broker_last_read_at: string | null
}

export interface RelationshipMessage {
  conversation_id: string
  created_at: string
}

export function countUnreadRelationshipConversations(
  conversations: RelationshipConversation[],
  userMessages: RelationshipMessage[],
): number {
  const readAt = new Map(conversations.map((c) => [c.id, c.broker_last_read_at]))
  const unread = new Set<string>()
  for (const m of userMessages) {
    if (!readAt.has(m.conversation_id)) continue
    const r = readAt.get(m.conversation_id)
    if (!r || new Date(m.created_at) > new Date(r)) unread.add(m.conversation_id)
  }
  return unread.size
}

// Consulta com ADMIN client: a RLS de conversations não libera a
// gerente-relacionamento (mesmo motivo do layout e da página do Chat).
// Limite de 300 conversas preservado do desenho original (75-86).
export async function getChatUnreadCount(
  admin: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { data: convs } = await admin
    .from("conversations")
    .select("id, broker_last_read_at")
    .eq("org_id", orgId)
    .eq("is_relationship", true)
    .limit(300)

  const conversations = (convs ?? []) as RelationshipConversation[]
  if (conversations.length === 0) return 0

  const { data: msgs } = await admin
    .from("messages")
    .select("conversation_id, created_at")
    .in("conversation_id", conversations.map((c) => c.id))
    .eq("role", "user")

  return countUnreadRelationshipConversations(
    conversations,
    (msgs ?? []) as RelationshipMessage[],
  )
}
