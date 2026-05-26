/**
 * Memory Writer — populates lead_memories with semantic fragments per conversation turn.
 * Inspired by MemPalace's verbatim storage layer.
 *
 * Complements memory-extraction.ts (regex → lead_facts) with Haiku-classified fragments.
 * Zero blocking impact: all writes are called as fire-and-forget from pipeline.ts.
 */

import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateEmbedding } from "../rag/embeddings"
import { detectRoom } from "./loader"

// ============================================
// TYPES
// ============================================

export interface MemoryFragment {
  room: string
  hall: Hall
  content: string
  importance: number
}

type Hall = "preferences" | "objections" | "events" | "facts"

const VALID_HALLS: Hall[] = ["preferences", "objections", "events", "facts"]
const MIN_IMPORTANCE = 0.3

// ============================================
// HAIKU EXTRACTION
// ============================================

const EXTRACTION_PROMPT = `Você é um agente de extração de memória para Nicole, assistente de vendas imobiliárias.

Dado o turno de conversa abaixo, extraia até 3 fragmentos memoráveis.
Retorne APENAS JSON válido (array). Se não houver nada memorável, retorne [].

Rooms: visit_scheduling|negotiation|property_vind|property_yarden|qualification|general
Halls:
  preferences — o que o lead quer ou prefere
  objections  — resistências, preocupações com preço ou timing
  events      — coisas que aconteceram (visita agendada, pediu handoff)
  facts       — contexto de vida não capturado por regex (motivação, situação familiar)

Formato: [{"room":"...","hall":"...","content":"frase concisa em PT-BR","importance":0.0-1.0}]
Importance: 0.8+=muito relevante | 0.5-0.8=relevante | <0.3=não vale registrar

Room detectado do contexto: {room}
Lead: "{userMsg}"
Nicole: "{assistantMsg}"`

/**
 * Call Haiku to extract memorable fragments from a conversation turn.
 * Returns [] on any parsing failure — never throws.
 */
export async function extractMemoryFragments(
  anthropic: Anthropic,
  userMsg: string,
  assistantMsg: string,
  room: string
): Promise<MemoryFragment[]> {
  const prompt = EXTRACTION_PROMPT
    .replace("{room}", room)
    .replace("{userMsg}", userMsg.slice(0, 500))
    .replace("{assistantMsg}", assistantMsg.slice(0, 500))

  try {
    const response = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 10000 }
    )

    const firstBlock = response.content[0]
    const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : ""
    return parseFragments(text)
  } catch {
    return []
  }
}

function parseFragments(text: string): MemoryFragment[] {
  try {
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item): item is MemoryFragment =>
          typeof item === "object" &&
          item !== null &&
          typeof item.room === "string" &&
          typeof item.hall === "string" &&
          typeof item.content === "string" &&
          typeof item.importance === "number" &&
          VALID_HALLS.includes(item.hall as Hall)
      )
      .slice(0, 3)
  } catch {
    return []
  }
}

// ============================================
// EMBEDDING + INSERT
// ============================================

/**
 * Generate embeddings and insert fragments into lead_memories.
 * Fragments with importance < MIN_IMPORTANCE are discarded.
 * Each insert failure is caught independently — partial success is OK.
 */
export async function saveMemoryFragments(
  supabase: SupabaseClient,
  leadId: string,
  fragments: MemoryFragment[]
): Promise<void> {
  const eligible = fragments.filter((f) => f.importance >= MIN_IMPORTANCE)
  if (eligible.length === 0) return

  for (const fragment of eligible) {
    try {
      const embedding = await generateEmbedding(fragment.content)
      await supabase.from("lead_memories").insert({
        lead_id: leadId,
        room: fragment.room,
        hall: fragment.hall,
        content: fragment.content,
        importance: fragment.importance,
        embedding,
      })
    } catch {
      // Non-blocking: log and continue with remaining fragments
      console.error(`[MEMORY_WRITER] Failed to save fragment (room=${fragment.room})`)
    }
  }
}

// ============================================
// ORCHESTRATOR
// ============================================

/**
 * Full pipeline: detect room → extract fragments → save to lead_memories.
 * Called as fire-and-forget from pipeline.ts step 12.5c.
 * Never throws — all errors are caught internally.
 */
export async function processConversationTurn(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  leadId: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  try {
    const detectedRoom = detectRoom(userMsg) ?? "general"
    const fragments = await extractMemoryFragments(anthropic, userMsg, assistantMsg, detectedRoom)
    await saveMemoryFragments(supabase, leadId, fragments)
  } catch (err) {
    console.error("[MEMORY_WRITER] processConversationTurn failed (non-blocking):", err)
  }
}
