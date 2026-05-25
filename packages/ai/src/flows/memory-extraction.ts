/**
 * Deterministic memory extraction from WhatsApp messages (PT-BR).
 * Zero-LLM: pure regex extraction, $0.00 cost.
 * Inspired by MemPalace's general_extractor.py.
 */

export interface ExtractedFact {
  predicate: string
  object: string
  confidence: number
}

// ============================================
// REGEX PATTERNS — Brazilian Portuguese
// ============================================

const PATTERNS = {
  // Profile
  name: /(?:me\s+chamo|meu\s+nome\s+[eé])\s+([A-ZÀ-Ú][a-záéíóúâêôãõç]+(?:\s+[A-ZÀ-Ú]?[a-záéíóúâêôãõç]+)*)(?=[,.\s!?]|$)|(?:sou\s+(?:o|a)\s+)([A-ZÀ-Ú][a-záéíóúâêôãõç]+(?:\s+[A-ZÀ-Ú]?[a-záéíóúâêôãõç]+)*)(?=[,.\s!?]|$)/i,
  profession: /(?:trabalho\s+(?:como|de)\s+|profiss[aã]o\s+)([a-záéíóúâêôãõç]+(?:\s+[a-záéíóúâêôãõç]+){0,2})/i,
  marital: /(?:sou\s+)?(casad[oa]|solteir[oa]|divorciad[oa]|vi[uú]v[oa]|noiv[oa])/i,
  children: /(?:tenho\s+)?(\d+)\s+filh[oa]s?/i,

  // Preferences
  bedrooms: /(\d)\s*(?:quartos?|dormit[oó]rios?|su[ií]tes?)/i,
  floor: /(?:andar\s*)(alto|baixo|m[eé]dio|\d+[oº]?)/i,
  view: /(?:vista\s+(?:para\s+)?(?:a\s+|o\s+)?)(norte|sul|leste|oeste|frente|fundos|lateral|piscina|rua)/i,
  garage: /(\d)\s*(?:vagas?|garagens?)/i,

  // Financial
  budget: /(?:or[cç]amento|at[eé]|valor\s*m[aá]x(?:imo)?|posso\s+pagar)\s*(?:de\s+)?(?:R\$\s*)?(\d[\d.,]*(?:\s*(?:mil|k))?)/i,
  down_payment: /(?:entrada|sinal)\s*(?:de\s+)?(?:R\$\s*)?(\d[\d.,]*(?:\s*(?:mil|k))?)/i,
  fgts: /(?:vou\s+usar|tenho|com|usar\s+o?)\s*FGTS/i,

  // Objections
  price_objection: /(?:(?:muito\s+)?caro|valor\s+alto|n[aã]o\s+tenho|fora\s+do\s+(?:meu\s+)?or[cç]amento|acima\s+do|pesado)/i,
  timing_objection: /(?:n[aã]o\s+[eé]\s+agora|mais\s+pra\s+frente|ainda\s+n[aã]o|preciso\s+pensar|(?:vou\s+)?conversar\s+com)/i,
  competition: /(?:vi\s+outro|tem\s+(?:um\s+)?(?:mais\s+barato|melhor)|t[oô]\s+(?:vendo|olhando)\s+outros?)/i,

  // Availability
  day_of_week: /(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:\s*[-]?\s*feira)?/gi,
  time_of_day: /(?:[aà]s?\s+)?(\d{1,2})\s*(?:h|hrs?|horas?|:\d{2})/i,
  relative_day: /(hoje|amanh[aã]|depois\s+de\s+amanh[aã]|semana\s+que\s+vem|pr[oó]xim[oa]\s+(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo))/i,

  // Property interest
  property_vind: /\b(?:vind)\b/i,
  property_yarden: /\b(?:yarden)\b/i,
} as const

/**
 * Extract structured facts from a user message using regex patterns.
 * Returns array of facts ready for lead_facts insertion.
 */
export function extractFactsFromMessage(message: string): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  const text = message.trim()

  if (text.length < 2) return facts

  // Profile
  const nameMatch = text.match(PATTERNS.name)
  if (nameMatch) {
    const name = (nameMatch[1] || nameMatch[2] || "").trim()
    if (name) facts.push({ predicate: "name", object: name, confidence: 0.9 })
  }

  const professionMatch = text.match(PATTERNS.profession)
  if (professionMatch) {
    facts.push({ predicate: "profession", object: professionMatch[1]!.trim(), confidence: 0.8 })
  }

  const maritalMatch = text.match(PATTERNS.marital)
  if (maritalMatch) {
    facts.push({ predicate: "marital_status", object: maritalMatch[1]!.toLowerCase(), confidence: 0.9 })
  }

  const childrenMatch = text.match(PATTERNS.children)
  if (childrenMatch) {
    facts.push({ predicate: "children_count", object: childrenMatch[1]!, confidence: 0.9 })
  }

  // Preferences
  const bedroomsMatch = text.match(PATTERNS.bedrooms)
  if (bedroomsMatch) {
    facts.push({ predicate: "prefers_bedrooms", object: bedroomsMatch[1]!, confidence: 0.95 })
  }

  const floorMatch = text.match(PATTERNS.floor)
  if (floorMatch) {
    facts.push({ predicate: "prefers_floor", object: floorMatch[1]!.toLowerCase(), confidence: 0.85 })
  }

  const viewMatch = text.match(PATTERNS.view)
  if (viewMatch) {
    facts.push({ predicate: "prefers_view", object: viewMatch[1]!.toLowerCase(), confidence: 0.85 })
  }

  const garageMatch = text.match(PATTERNS.garage)
  if (garageMatch) {
    facts.push({ predicate: "prefers_garage", object: garageMatch[1]!, confidence: 0.9 })
  }

  // Financial
  const budgetMatch = text.match(PATTERNS.budget)
  if (budgetMatch) {
    facts.push({ predicate: "budget", object: budgetMatch[1]!.trim(), confidence: 0.8 })
  }

  const downPaymentMatch = text.match(PATTERNS.down_payment)
  if (downPaymentMatch) {
    facts.push({ predicate: "down_payment", object: downPaymentMatch[1]!.trim(), confidence: 0.85 })
  }

  if (PATTERNS.fgts.test(text)) {
    facts.push({ predicate: "uses_fgts", object: "true", confidence: 0.95 })
  }

  // Objections
  if (PATTERNS.price_objection.test(text)) {
    facts.push({ predicate: "objection", object: "price", confidence: 0.7 })
  }

  if (PATTERNS.timing_objection.test(text)) {
    facts.push({ predicate: "objection", object: "timing", confidence: 0.7 })
  }

  if (PATTERNS.competition.test(text)) {
    facts.push({ predicate: "objection", object: "competition", confidence: 0.7 })
  }

  // Availability
  const dayMatches = text.match(PATTERNS.day_of_week)
  if (dayMatches) {
    facts.push({ predicate: "available_day", object: dayMatches[0].toLowerCase(), confidence: 0.8 })
  }

  const timeMatch = text.match(PATTERNS.time_of_day)
  if (timeMatch) {
    facts.push({ predicate: "available_time", object: `${timeMatch[1]}h`, confidence: 0.8 })
  }

  const relativeDayMatch = text.match(PATTERNS.relative_day)
  if (relativeDayMatch) {
    facts.push({ predicate: "available_day", object: relativeDayMatch[1]!.toLowerCase(), confidence: 0.8 })
  }

  // Property interest
  if (PATTERNS.property_vind.test(text)) {
    facts.push({ predicate: "interested_in", object: "vind", confidence: 0.9 })
  }

  if (PATTERNS.property_yarden.test(text)) {
    facts.push({ predicate: "interested_in", object: "yarden", confidence: 0.9 })
  }

  return facts
}
