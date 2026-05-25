import type Anthropic from "@anthropic-ai/sdk"
import { calculateQualificationScore } from "./qualification"

interface EnrichmentInput {
  messages: Array<{ role: string; content: string }>
  currentCollectedData: Record<string, unknown>
}

interface EnrichmentResult {
  summary: string
  extracted_data: Record<string, unknown>
}

const ENRICHMENT_PROMPT = `Voce e um assistente de extracao de dados. Analise a conversa abaixo entre Nicole (assistente de vendas) e um lead interessado em imoveis.

Retorne um JSON com exatamente dois campos:
1. "summary": resumo da conversa em portugues (max 200 palavras, foco em: perfil do lead, interesse, preferencias, objecoes, proximo passo)
2. "extracted_data": objeto com APENAS campos que foram EXPLICITAMENTE mencionados pelo lead na conversa

Campos possiveis em extracted_data:
- name: string (nome do lead)
- email: string
- property_interest: "vind" | "yarden"
- bedrooms: number
- floor: "alto" | "baixo" | "medio"
- view: "frente" | "fundos"
- garages: number
- has_down_payment: true | false
- source: "meta_ads" | "website" | "referral" | "walk_in"
- visit_availability: string (dia/horario mencionado)

REGRAS:
- Retorne APENAS JSON valido, sem markdown, sem code blocks
- Em extracted_data, inclua SOMENTE campos que o lead mencionou explicitamente
- NAO invente dados — se o lead nao falou, nao inclua o campo
- Se o lead mencionou interesse em ambos empreendimentos, use o que ele demonstrou MAIS interesse
- Para source, mapeie: instagram/facebook/tiktok → "meta_ads", google/youtube → "website", indicacao/amigo → "referral", placa/stand/passou na frente → "walk_in"`

/**
 * Calls Haiku to extract structured data + summary from a conversation.
 * Returns both in a single API call for cost efficiency.
 */
export async function enrichLeadFromConversation(
  anthropic: Anthropic,
  input: EnrichmentInput
): Promise<EnrichmentResult | null> {
  const messagesText = input.messages
    .map((m) => `${m.role === "user" ? "Lead" : "Nicole"}: ${m.content}`)
    .join("\n")

  const prompt = `${ENRICHMENT_PROMPT}

Dados ja coletados: ${JSON.stringify(input.currentCollectedData)}

Conversa:
${messagesText}`

  const response = await anthropic.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: 15000 }
  )

  const firstBlock = response.content[0]
  const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : ""
  return parseEnrichmentResponse(text)
}

/**
 * Parses the Haiku JSON response, handling potential formatting issues.
 */
export function parseEnrichmentResponse(text: string): EnrichmentResult | null {
  try {
    // Strip markdown code blocks if Haiku wraps in ```json
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)

    if (typeof parsed.summary !== "string" || typeof parsed.extracted_data !== "object") {
      return null
    }

    return {
      summary: parsed.summary,
      extracted_data: parsed.extracted_data ?? {},
    }
  } catch {
    return null
  }
}

/**
 * Maps extracted_data fields to leads table column names.
 * Returns only non-null fields that should be updated.
 */
export function mapExtractedDataToLeadFields(
  extractedData: Record<string, unknown>,
  existingLeadData: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (extractedData.name && typeof extractedData.name === "string") {
    patch.name = extractedData.name
  }
  if (extractedData.email && typeof extractedData.email === "string") {
    patch.email = extractedData.email
  }
  if (extractedData.bedrooms && typeof extractedData.bedrooms === "number") {
    patch.preferred_bedrooms = extractedData.bedrooms
  }
  if (extractedData.floor && typeof extractedData.floor === "string") {
    patch.preferred_floor = extractedData.floor
  }
  if (extractedData.view && typeof extractedData.view === "string") {
    patch.preferred_view = extractedData.view
  }
  if (extractedData.garages && typeof extractedData.garages === "number") {
    patch.preferred_garage_count = extractedData.garages
  }
  if (typeof extractedData.has_down_payment === "boolean") {
    patch.has_down_payment = extractedData.has_down_payment
  }
  if (extractedData.source && typeof extractedData.source === "string") {
    const validSources = ["meta_ads", "website", "referral", "walk_in", "whatsapp_organic", "whatsapp_click_to_ad", "telegram", "other"]
    if (validSources.includes(extractedData.source)) {
      patch.source = extractedData.source
    }
  }

  // Recalculate qualification score from merged data
  const mergedForScore = { ...existingLeadData, ...extractedData }
  const score = calculateQualificationScore(mergedForScore)
  patch.qualification_score = score
  patch.qualification_status = score >= 70 ? "qualified" : score > 0 ? "in_progress" : "not_started"
  patch.interest_level = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold"

  return patch
}
