/**
 * Progressive Memory Loading System (L0-L3).
 * Inspired by MemPalace's layers.py.
 *
 * L0 (~200 tokens): Personality + guardrails — handled by buildSystemPrompt(), not here.
 * L1 (~100-150 tokens): Lead snapshot from active lead_facts.
 * L2 (~300-500 tokens): Topic-specific memories from lead_memories (room/hall filtered).
 * L3 (~500-1000 tokens): Deep semantic search via match_lead_memory().
 *
 * Total memory budget: max ~1850 tokens (vs ~4000 with 20 raw messages).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { generateEmbedding } from "../rag/embeddings"

// ============================================
// TYPES
// ============================================

interface LeadFact {
  predicate: string
  object: string
  confidence: number
  valid_from: string
}

interface LeadMemory {
  room: string
  hall: string
  content: string
  importance: number
  similarity?: number
}

export interface MemoryContext {
  l1Snapshot: string
  l2TopicMemories: string
  l3DeepSearch: string
  totalTokenEstimate: number
}

// ============================================
// L1 — Lead Snapshot (always loaded, ~100-150 tokens)
// ============================================

/**
 * Build a structured snapshot from active lead_facts.
 * Groups by predicate type for readability.
 */
export async function loadL1Snapshot(
  supabase: SupabaseClient,
  leadId: string
): Promise<string> {
  const { data: facts, error } = await supabase
    .from("lead_facts")
    .select("predicate, object, confidence")
    .eq("lead_id", leadId)
    .is("valid_to", null)
    .order("confidence", { ascending: false })
    .limit(30)

  if (error || !facts || facts.length === 0) return ""

  const grouped: Record<string, string[]> = {}
  for (const fact of facts as LeadFact[]) {
    const category = categorize(fact.predicate)
    if (!grouped[category]) grouped[category] = []
    grouped[category].push(`${fact.predicate}=${fact.object}`)
  }

  const lines: string[] = []
  for (const [category, items] of Object.entries(grouped)) {
    lines.push(`${category}: ${items.join(", ")}`)
  }

  return lines.length > 0
    ? `MEMORIA DO LEAD (fatos ativos):\n${lines.join("\n")}`
    : ""
}

function categorize(predicate: string): string {
  if (["name", "profession", "marital_status", "children_count"].includes(predicate)) return "PERFIL"
  if (predicate.startsWith("prefers_") || predicate === "interested_in") return "PREFERENCIAS"
  if (["budget", "down_payment", "uses_fgts"].includes(predicate)) return "FINANCEIRO"
  if (predicate === "objection") return "OBJECOES"
  if (predicate.startsWith("available_")) return "DISPONIBILIDADE"
  return "OUTROS"
}

// ============================================
// L2 — Topic Memories (on-demand, ~300-500 tokens)
// ============================================

/**
 * Detect conversation topic from user message and load relevant memories.
 */
export async function loadL2TopicMemories(
  supabase: SupabaseClient,
  leadId: string,
  userMessage: string
): Promise<string> {
  const room = detectRoom(userMessage)
  if (!room) return ""

  const { data: memories, error } = await supabase
    .from("lead_memories")
    .select("hall, content, importance")
    .eq("lead_id", leadId)
    .eq("room", room)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10)

  if (error || !memories || memories.length === 0) return ""

  const lines = (memories as LeadMemory[]).map(
    (m) => `[${m.hall}] ${m.content}`
  )

  return `CONTEXTO DO TOPICO (${room}):\n${lines.join("\n")}`
}

/**
 * Detect room (topic) from message keywords.
 */
export function detectRoom(message: string): string | null {
  const text = message.toLowerCase()

  if (/visit|agenda|hor[aá]rio|dia|quando/.test(text)) return "visit_scheduling"
  if (/pre[cç]o|valor|financ|parcela|entrada|pagamento/.test(text)) return "negotiation"
  if (/vind/i.test(text)) return "property_vind"
  if (/yarden/i.test(text)) return "property_yarden"
  if (/quarto|su[ií]te|andar|vista|garagem|metragem|planta/.test(text)) return "qualification"

  return null
}

// ============================================
// L3 — Deep Semantic Search (on-demand, ~500-1000 tokens)
// ============================================

/**
 * Semantic search across all lead memories via pgvector.
 * Used when explicit topic detection fails or for disambiguation.
 */
export async function loadL3DeepSearch(
  supabase: SupabaseClient,
  leadId: string,
  query: string
): Promise<string> {
  try {
    const embedding = await generateEmbedding(query)

    const { data: results, error } = await supabase.rpc("match_lead_memory", {
      query_embedding: embedding,
      match_lead_id: leadId,
      match_threshold: 0.6,
      match_count: 5,
    })

    if (error || !results || results.length === 0) return ""

    const lines = (results as LeadMemory[]).map(
      (r) => `[${r.room}/${r.hall}] ${r.content}`
    )

    return `MEMORIA RELEVANTE:\n${lines.join("\n")}`
  } catch {
    return ""
  }
}

// ============================================
// UNIFIED LOADER
// ============================================

/**
 * Load progressive memory context for Nicole's pipeline.
 * Replaces the old ai_summary injection.
 *
 * @param supabase - Supabase client
 * @param leadId - Lead UUID
 * @param userMessage - Current user message (for topic detection)
 * @param aiSummaryFallback - Existing ai_summary for backward compatibility
 */
export async function loadMemoryContext(
  supabase: SupabaseClient,
  leadId: string,
  userMessage: string,
  aiSummaryFallback?: string | null
): Promise<MemoryContext> {
  // Always load L1
  const l1Snapshot = await loadL1Snapshot(supabase, leadId)

  // If no L1 data, fall back to ai_summary
  if (!l1Snapshot && aiSummaryFallback) {
    return {
      l1Snapshot: `MEMORIA DO LEAD (resumo):\n${aiSummaryFallback}`,
      l2TopicMemories: "",
      l3DeepSearch: "",
      totalTokenEstimate: estimateTokens(aiSummaryFallback),
    }
  }

  // Load L2 based on topic detection
  const l2TopicMemories = await loadL2TopicMemories(supabase, leadId, userMessage)

  // L3 only if no L2 results and message is a question
  const isQuestion = /\?|como|onde|quando|qual|quanto/.test(userMessage.toLowerCase())
  const l3DeepSearch =
    !l2TopicMemories && isQuestion
      ? await loadL3DeepSearch(supabase, leadId, userMessage)
      : ""

  const totalTokenEstimate =
    estimateTokens(l1Snapshot) +
    estimateTokens(l2TopicMemories) +
    estimateTokens(l3DeepSearch)

  return { l1Snapshot, l2TopicMemories, l3DeepSearch, totalTokenEstimate }
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}
