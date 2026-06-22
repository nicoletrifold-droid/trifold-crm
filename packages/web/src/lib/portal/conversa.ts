import "server-only"

import type { createAdminClient } from "@web/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

/**
 * Story 75-16 — Garante a conversa do portal (obra_conversas) para (obra, cliente).
 * Se ainda não existe, cria atribuída ao ATENDENTE PADRÃO da org
 * (organizations.portal_atendente_padrao_id). Se já existe, reabre (status='aberta')
 * e toca o updated_at. Roda com admin client (cliente não tem RLS p/ obra_conversas).
 *
 * Retorna o id da conversa (ou null se falhar — nunca lança, p/ não quebrar o envio).
 */
export async function ensureConversaAtribuida(
  admin: Admin,
  args: { obraId: string; orgId: string; clienteId: string }
): Promise<string | null> {
  const { obraId, orgId, clienteId } = args
  try {
    const { data: existing } = await admin
      .from("obra_conversas")
      .select("id")
      .eq("obra_id", obraId)
      .eq("cliente_id", clienteId)
      .maybeSingle()

    if (existing) {
      await admin
        .from("obra_conversas")
        .update({ status: "aberta", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      return existing.id
    }

    const { data: org } = await admin
      .from("organizations")
      .select("portal_atendente_padrao_id")
      .eq("id", orgId)
      .maybeSingle()

    const { data: created } = await admin
      .from("obra_conversas")
      .insert({
        obra_id: obraId,
        org_id: orgId,
        cliente_id: clienteId,
        assigned_to: org?.portal_atendente_padrao_id ?? null,
        status: "aberta",
      })
      .select("id")
      .single()

    return created?.id ?? null
  } catch (err) {
    console.error("[portal/conversa] ensureConversaAtribuida error:", err)
    return null
  }
}
