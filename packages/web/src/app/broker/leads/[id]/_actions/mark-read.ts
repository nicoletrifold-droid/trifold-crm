"use server"

import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"

/**
 * Story 63-16 (Epic 63 Fase 6) — Marca como lidas todas as conversas de um lead.
 *
 * Disparada ao abrir `/broker/leads/[id]`. Atualiza
 * `conversations.broker_last_read_at = now()` para todas as conversas do lead,
 * o que zera a contagem de não-lidas daquele lead no próximo request do layout.
 *
 * Autorização: a RLS de UPDATE de `conversations` é org-scoped
 * (`org_id = user_org_id()`), então a restrição ao lead do próprio corretor é
 * feita na camada de aplicação — verificamos `assigned_broker_id = user.id`
 * antes do UPDATE. Usa a sessão do corretor (`createClient()`), não admin.
 *
 * Best-effort: qualquer falha é silenciada — marcar lido nunca deve derrubar a
 * renderização da página.
 */
export async function markLeadConversationsRead(leadId: string): Promise<void> {
  try {
    const user = await getServerUser()
    const supabase = await createClient()

    // Ownership: o lead precisa estar atribuído ao corretor logado.
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("assigned_broker_id", user.id)
      .maybeSingle()

    if (!lead) return

    await supabase
      .from("conversations")
      .update({ broker_last_read_at: new Date().toISOString() })
      .eq("lead_id", leadId)
  } catch {
    // best-effort — não propaga erro
  }
}
