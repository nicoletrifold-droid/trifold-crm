import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  classifyContactIntent,
  createAnthropicClient,
  type ContactClassification,
} from "@trifold/ai"

/**
 * Classifica um lead a partir da PRIMEIRA mensagem inbound (role='user') de
 * suas conversas. Usado pelos caminhos de distribuição automática que só têm
 * o `leadId` em mãos (ex.: cron de retry da roleta), garantindo a mesma
 * triagem lead/não-lead do webhook.
 *
 * Nunca lança. Princípio da assimetria: sem mensagem, sem conversa ou em
 * qualquer erro → default seguro `isLead: true` (nunca bloquear comprador real).
 */
export async function classifyLeadFirstMessage(
  supabase: SupabaseClient,
  leadId: string
): Promise<ContactClassification> {
  try {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", leadId)

    const convIds = (convs ?? []).map((c: { id: string }) => c.id)
    if (convIds.length === 0) {
      return { isLead: true, category: "lead", reason: "Sem conversa para classificar." }
    }

    const { data: msg } = await supabase
      .from("messages")
      .select("content, metadata")
      .in("conversation_id", convIds)
      .eq("role", "user")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const text = (msg?.content as string | undefined)?.trim() ?? ""
    const mediaType = (msg?.metadata as { media_type?: string } | null)?.media_type
    const hasDocument = mediaType === "document"

    if (!text && !hasDocument) {
      return { isLead: true, category: "lead", reason: "Sem mensagem inbound." }
    }

    return await classifyContactIntent(createAnthropicClient(), text, { hasDocument })
  } catch {
    return { isLead: true, category: "lead", reason: "Falha na classificação; default seguro." }
  }
}
