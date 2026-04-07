/**
 * Lead qualification flow.
 * Calculates qualification scores, determines next steps,
 * and extracts collected data from AI responses.
 */

const SCORE_WEIGHTS: Record<string, number> = {
  name: 10,
  property_interest: 15,
  bedrooms: 10,
  floor: 10,
  view: 10,
  garages: 5,
  has_down_payment: 15,
  source: 5,
  visit_availability: 20,
}

const QUALIFICATION_STEPS = [
  "name",
  "property_interest",
  "bedrooms",
  "floor",
  "view",
  "garages",
  "has_down_payment",
  "source",
  "visit_availability",
] as const

/**
 * Calculates a qualification score (0-100) based on collected data.
 * Each field contributes its weight when present and non-empty.
 */
export function calculateQualificationScore(
  collectedData: Record<string, unknown>
): number {
  let score = 0

  for (const [field, weight] of Object.entries(SCORE_WEIGHTS)) {
    const value = collectedData[field]
    if (value !== undefined && value !== null && value !== "") {
      score += weight
    }
  }

  return Math.min(score, 100)
}

/**
 * Returns the next qualification step that hasn't been collected yet.
 * Steps follow a natural conversation flow order.
 */
export function getNextQualificationStep(
  collectedData: Record<string, unknown>
): string {
  for (const step of QUALIFICATION_STEPS) {
    const value = collectedData[step]
    if (value === undefined || value === null || value === "") {
      return step
    }
  }

  return "complete"
}

// Portuguese spelled-out numbers (AC9)
const PT_NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2,
  "três": 3, tres: 3, quatro: 4,
  cinco: 5, seis: 6,
}

function parsePortugueseNumber(text: string): number | null {
  for (const [word, num] of Object.entries(PT_NUMBERS)) {
    if (text.includes(word)) return num
  }
  return null
}

/**
 * Extracts newly collected data from an AI response and merges it with current data.
 * Looks for structured patterns in the response that indicate data collection.
 */
export function extractCollectedData(
  aiResponse: string,
  currentData: Record<string, unknown>
): Record<string, unknown> {
  const updated = { ...currentData }
  const lower = aiResponse.toLowerCase()

  // Extract name mentions (AC6 — expanded PT-BR patterns)
  if (!updated.name) {
    const namePatterns = [
      /(?:prazer|olá|ola|obrigad[ao]),?\s+([A-Za-zÀ-ÿ][a-zà-ÿ]+(?:\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)*)/i,
      /(?:certo|entendi),?\s+([A-Za-zÀ-ÿ][a-zà-ÿ]+(?:\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)*)/i,
      /(?:meu nome [eé]|me chamo|sou (?:o |a )?)\s*([A-Za-zÀ-ÿ][a-zà-ÿ]+(?:\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)*)/i,
      /(?:pode me chamar de|me chamam de)\s*([A-Za-zÀ-ÿ][a-zà-ÿ]+(?:\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)*)/i,
      /(?:aqui [eé]\s*(?:o |a )?)\s*([A-Za-zÀ-ÿ][a-zà-ÿ]+(?:\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)*)/i,
    ]
    for (const pattern of namePatterns) {
      const match = aiResponse.match(pattern)
      if (match?.[1]) {
        const extractedName = match[1].trim()
        if (extractedName.toLowerCase() !== "nicole") {
          updated.name = extractedName
          break
        }
      }
    }
    // Short message fallback: if message is 1-3 words and starts with capital, treat as name
    if (!updated.name) {
      const trimmed = aiResponse.trim()
      const words = trimmed.split(/\s+/)
      if (words.length >= 1 && words.length <= 3 && /^[A-ZÀ-Ÿ]/.test(trimmed)) {
        const candidate = words.filter(w => /^[A-Za-zÀ-ÿ]+$/.test(w)).join(" ")
        if (candidate && candidate.toLowerCase() !== "nicole" && candidate.length >= 2) {
          updated.name = candidate
        }
      }
    }
  }

  // Extract email (AC5)
  if (!updated.email) {
    const emailMatch = aiResponse.match(/[\w.+-]+@[\w-]+\.[\w.]+/i)
    if (emailMatch?.[0]) {
      updated.email = emailMatch[0].toLowerCase()
    }
  }

  // Extract property interest — only when ONE property is mentioned (not comparisons)
  if (!updated.property_interest) {
    const mentionsVind = lower.includes("vind")
    const mentionsYarden = lower.includes("yarden")
    if (mentionsVind && !mentionsYarden) {
      updated.property_interest = "vind"
    } else if (mentionsYarden && !mentionsVind) {
      updated.property_interest = "yarden"
    }
    // If both mentioned, skip — let identifyProperty handle disambiguation
  }

  // Extract bedroom preferences (AC9 — with spelled-out numbers)
  if (!updated.bedrooms) {
    const bedroomMatch = aiResponse.match(/(\d+)\s*(?:quarto|dormitório|dormitorio|suite|suíte)/i)
    if (bedroomMatch?.[1]) {
      updated.bedrooms = parseInt(bedroomMatch[1], 10)
    } else {
      const ptMatch = lower.match(/(um|uma|dois|duas|três|tres|quatro|cinco|seis)\s+(?:quarto|dormitório|dormitorio|suite|suíte)/i)
      if (ptMatch?.[1]) {
        const num = parsePortugueseNumber(ptMatch[1])
        if (num) updated.bedrooms = num
      }
    }
  }

  // Extract floor preference (AC7 — expanded patterns)
  if (!updated.floor) {
    if (lower.includes("andar alto") || lower.includes("andares altos") ||
        lower.includes("lá em cima") || lower.includes("la em cima") ||
        lower.includes("mais alto") || lower.includes("bem alto")) {
      updated.floor = "alto"
    } else if (lower.includes("andar baixo") || lower.includes("andares baixos") ||
        lower.includes("mais baixo") || lower.includes("térreo") || lower.includes("terreo")) {
      updated.floor = "baixo"
    } else if (lower.includes("andar médio") || lower.includes("andar medio") ||
        lower.includes("andar do meio") || lower.includes("intermediário") || lower.includes("intermediario")) {
      updated.floor = "medio"
    }
  }

  // Extract view preference
  if (!updated.view) {
    if (lower.includes("vista frontal") || lower.includes("vista de frente") || lower.includes("frente")) {
      updated.view = "frente"
    } else if (lower.includes("vista fundos") || lower.includes("vista de fundos") || lower.includes("fundos")) {
      updated.view = "fundos"
    }
  }

  // Extract garage preference (AC9 — with spelled-out numbers)
  if (!updated.garages) {
    const garageMatch = aiResponse.match(/(\d+)\s*(?:vaga|garagem)/i)
    if (garageMatch?.[1]) {
      updated.garages = parseInt(garageMatch[1], 10)
    } else {
      const ptMatch = lower.match(/(um|uma|dois|duas|três|tres|quatro|cinco|seis)\s+(?:vaga|garagem)/i)
      if (ptMatch?.[1]) {
        const num = parsePortugueseNumber(ptMatch[1])
        if (num) updated.garages = num
      }
    }
  }

  // Extract down payment info (AC8 — expanded patterns)
  if (updated.has_down_payment === undefined) {
    if (lower.includes("entrada disponível") || lower.includes("entrada disponivel") ||
        lower.includes("tem entrada") || lower.includes("valor de entrada") ||
        lower.includes("tenho entrada") || lower.includes("consigo dar entrada") ||
        lower.includes("tenho o valor") || lower.includes("fgts")) {
      updated.has_down_payment = true
    } else if (lower.includes("sem entrada") || lower.includes("não tem entrada") ||
        lower.includes("nao tem entrada") || lower.includes("não tenho entrada") ||
        lower.includes("nao tenho entrada") || lower.includes("parcelar tudo") ||
        lower.includes("financiar tudo")) {
      updated.has_down_payment = false
    }
  }

  // Extract source — values map directly to lead_source DB enum (AC10 — expanded)
  if (!updated.source) {
    const sourceKeywords: Record<string, string> = {
      instagram: "meta_ads",
      facebook: "meta_ads",
      tiktok: "meta_ads",
      google: "website",
      youtube: "website",
      "indicação": "referral",
      indicacao: "referral",
      amigo: "referral",
      conhecido: "referral",
      "boca a boca": "referral",
      "passou na frente": "walk_in",
      placa: "walk_in",
      "stand de vendas": "walk_in",
      stand: "walk_in",
    }
    for (const [keyword, value] of Object.entries(sourceKeywords)) {
      if (lower.includes(keyword)) {
        updated.source = value
        break
      }
    }
  }

  // Extract visit availability — detect day/time mentions
  if (!updated.visit_availability) {
    const visitKeywords = [
      "sábado", "sabado", "domingo", "segunda", "terça", "terca",
      "quarta", "quinta", "sexta", "amanhã", "amanha",
      "semana que vem", "próxima semana", "proxima semana",
      "pode ser", "vou passar", "vou aí", "vou ai",
      "quero visitar", "quero conhecer", "quero ir",
      "posso ir", "posso visitar", "posso passar",
      "10h", "10 horas", "9h", "11h", "14h", "15h", "16h",
      "de manhã", "de manha", "à tarde", "a tarde",
      "esse sábado", "esse sabado", "nesse sábado",
    ]
    for (const kw of visitKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        updated.visit_availability = aiResponse.trim()
        break
      }
    }
  }

  return updated
}
