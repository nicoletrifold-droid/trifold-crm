import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

export interface LeadInbound {
  /** Data (ISO) da última mensagem do lead, ou null se não houver nenhuma. */
  lastInboundAt: string | null
  /** Todas as mensagens do lead concatenadas (para classificar o diálogo inteiro). */
  text: string
  /** Se alguma mensagem do lead anexou um documento (currículo, proposta etc.). */
  hasDocument: boolean
}

/**
 * Carrega o material para classificar um lead: o texto de TODAS as mensagens
 * inbound (role='user') do lead concatenadas, a data da última mensagem
 * (para checar inatividade) e se houve anexo de documento.
 *
 * Nunca lança — em erro/sem conversa, retorna vazio (o chamador trata como
 * "sem conversa para esperar").
 */
export async function loadLeadInboundForClassification(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadInbound> {
  const empty: LeadInbound = { lastInboundAt: null, text: "", hasDocument: false }
  try {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", leadId)

    const convIds = (convs ?? []).map((c: { id: string }) => c.id)
    if (convIds.length === 0) return empty

    const { data: msgs } = await supabase
      .from("messages")
      .select("content, metadata, created_at")
      .in("conversation_id", convIds)
      .eq("role", "user")
      .order("created_at", { ascending: true })

    const rows = (msgs ?? []) as Array<{
      content: string | null
      metadata: { media_type?: string } | null
      created_at: string
    }>
    if (rows.length === 0) return empty

    const text = rows
      .map((m) => (m.content ?? "").trim())
      .filter(Boolean)
      .join(" | ")
    const hasDocument = rows.some((m) => m.metadata?.media_type === "document")
    const lastInboundAt = rows[rows.length - 1]!.created_at

    return { lastInboundAt, text, hasDocument }
  } catch {
    return empty
  }
}
