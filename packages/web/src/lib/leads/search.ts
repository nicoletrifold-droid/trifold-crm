import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-167 — normalização de termo de busca de lead.
 *
 * Espelha o `lower(f_unaccent(name))` do banco (coluna gerada `leads.name_search`):
 * tira acentos (NFD + remove diacríticos, cobre ç→c) e baixa a caixa. Assim
 * "Andréia"/"ANDREIA"/"andreia" batem no mesmo termo. Também é o `p_term` passado
 * ao RPC `fuzzy_lead_ids` (typo/similaridade).
 */
export function normalizeSearchTerm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Versão segura do termo para interpolar DENTRO de um filtro PostgREST `.or(...)`
 * (que é delimitado por vírgula e usa parênteses): remove vírgula/parênteses e os
 * curingas de LIKE, evitando quebrar a sintaxe do filtro. Use no lado ILIKE do `.or`.
 */
export function orSafeSearchTerm(s: string | null | undefined): string {
  return normalizeSearchTerm(s).replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim()
}

// Cliente Supabase (genéricos livres — só usamos `.rpc`). Evita acoplar à aridade
// exata dos generics do server/admin client.
type RpcCapable = { rpc: SupabaseClient["rpc"] }

/**
 * Story 75-167 — monta o filtro PostgREST `.or(...)` de busca de lead:
 *  - nome SEM ACENTO (coluna gerada `name_search`, via ILIKE)
 *  - telefone por dígitos
 *  - FUZZY/typo: ids de nomes parecidos (RPC `fuzzy_lead_ids`, trigram)
 * Retorna "" quando não há termo útil (o caller então não aplica `.or`).
 * Preserva os demais filtros/paginação do caller (só cobre o trecho de busca).
 */
export async function buildLeadSearchOrFilter(
  supabase: RpcCapable,
  orgId: string | null | undefined,
  rawTerm: string | null | undefined
): Promise<string> {
  const parts: string[] = []
  const norm = orSafeSearchTerm(rawTerm)
  if (norm) parts.push(`name_search.ilike.%${norm}%`)

  const digits = (rawTerm ?? "").replace(/\D/g, "")
  if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`)

  const fullNorm = normalizeSearchTerm(rawTerm)
  if (orgId && fullNorm.length >= 3) {
    const { data } = await supabase.rpc("fuzzy_lead_ids", { p_org: orgId, p_term: fullNorm })
    const ids = ((data as { id: string }[] | null) ?? []).map((r) => r.id).filter(Boolean)
    if (ids.length) parts.push(`id.in.(${ids.join(",")})`)
  }

  return parts.join(",")
}
