import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-44 — Detecta o empreendimento (property) de interesse a partir de
 * texto livre: nome de campanha/anúncio/formulário do Meta, ou o diálogo do
 * WhatsApp. Match determinístico por keyword derivada do nome do property
 * (sem custo de IA).
 *
 * Regra: carrega os properties ativos da org; um property "casa" se o texto
 * contém o nome completo OU a primeira palavra significativa (>= 4 chars) dele
 * (ex.: "Vind Residence" → "vind"; "Yarden" → "yarden").
 *  - exatamente 1 property distinto casado → retorna o id.
 *  - nenhum, ou ambíguo (2+ properties distintos) → retorna null (= pool geral).
 *
 * Nunca lança: em erro, retorna null (fallback seguro = pool geral).
 *
 * Usa o client recebido — passar o admin client (service role) quando chamado
 * de webhook/cron, pois aí é obrigatório filtrar por `org_id` (RLS bypassed).
 */
export async function detectPropertyInterestId(
  supabase: SupabaseClient,
  orgId: string,
  ...texts: Array<string | null | undefined>
): Promise<string | null> {
  const haystack = texts
    .map((t) => (t ?? "").toLowerCase())
    .join(" ")
    .trim()
  if (!haystack) return null

  try {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name")
      .eq("org_id", orgId)
      .eq("is_active", true)

    const matched = new Set<string>()
    for (const p of (properties ?? []) as Array<{ id: string; name: string }>) {
      const name = (p.name ?? "").toLowerCase().trim()
      if (!name) continue
      const firstWord = name.split(/\s+/)[0] ?? ""
      const keywords = firstWord.length >= 4 ? [name, firstWord] : [name]
      if (keywords.some((kw) => haystack.includes(kw))) matched.add(p.id)
    }

    // Exatamente um empreendimento identificado; ambíguo ou nenhum → null.
    return matched.size === 1 ? [...matched][0]! : null
  } catch {
    return null
  }
}
