import type { SupabaseClient } from "@supabase/supabase-js"
import { generateEmbedding } from "./embeddings"

export interface KnowledgeResult {
  id: string
  title: string
  content: string
  similarity: number
}

/**
 * Search the knowledge base using vector similarity.
 *
 * Generates an embedding for the query, then calls the match_knowledge
 * Postgres RPC function to find the most relevant documents.
 */
export async function searchKnowledge(
  supabase: SupabaseClient,
  query: string,
  orgId: string,
  propertyId?: string,
  limit: number = 5
): Promise<KnowledgeResult[]> {
  const embedding = await generateEmbedding(query)

  // Story 75-173 — threshold calibrado para text-embedding-3-small (escala de
  // similaridade mais baixa que a do ada-002): match correto medido em prod ≈ 0.63,
  // ruído ≈ 0.35-0.41. O 0.7 antigo filtrava TUDO (RAG voltava sempre vazio).
  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_org_id: orgId,
    match_property_id: propertyId ?? null,
    match_threshold: 0.45,
    match_count: limit,
  })

  if (error) {
    console.error("Error searching knowledge base:", error)
    return []
  }

  return (data ?? []) as KnowledgeResult[]
}
