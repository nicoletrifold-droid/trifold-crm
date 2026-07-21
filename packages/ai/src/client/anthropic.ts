import Anthropic from "@anthropic-ai/sdk"

/**
 * Story 82-1 — strings de modelo centralizadas. A rota /summary usava uma
 * string antiga (claude-haiku-4-20250414) divergente do cron enrich-leads;
 * todo consumidor deve importar daqui.
 */
export const ANTHROPIC_MODELS = {
  /** Extrações/classificações baratas (enrich, classify, resumo). */
  haiku: "claude-haiku-4-5-20251001",
  /** Raciocínio sobre comportamento/recomendações (análise do lead). */
  sonnet: "claude-sonnet-5",
} as const

export function createAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
}
