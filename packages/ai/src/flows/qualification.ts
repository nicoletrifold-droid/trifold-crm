/**
 * Lead qualification flow.
 * Calculates qualification scores, determines next steps,
 * and extracts collected data from AI responses.
 */
import { isAmbiguousSlotText } from "./visit-slot"

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
 * Story 75-161 — palavras que NÃO são nome (evita gravar "Sim"/"Quero"/"Vind"
 * como nome quando o lead responde curto). Comparadas em minúsculas, por palavra.
 */
const NAME_STOPWORDS = new Set<string>([
  "sim", "nao", "não", "oi", "ola", "olá", "ok", "okay", "blz", "beleza", "claro",
  "quero", "queria", "gostaria", "preciso", "tenho", "sei", "nada", "tudo", "certo",
  "bom", "boa", "dia", "tarde", "noite", "obrigado", "obrigada", "valeu", "opa", "eae",
  "vind", "yarden", "apartamento", "apto", "ape", "apê", "casa", "imovel", "imóvel",
  "info", "informacao", "informação", "informacoes", "informações", "material", "materiais",
  "foto", "fotos", "imagem", "imagens", "planta", "preco", "preço", "valor", "valores",
  "meu", "nome", "sou", "eu", "voce", "você", "aqui", "isso", "esse", "essa",
])

/** Story 75-161 — capitaliza cada palavra do nome ("maicon" → "Maicon"). */
function capitalizeName(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
}

/**
 * Extracts newly collected data from an AI response and merges it with current data.
 * Looks for structured patterns in the response that indicate data collection.
 */
export function extractCollectedData(
  aiResponse: string,
  currentData: Record<string, unknown>,
  opts?: { nameExpected?: boolean }
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
          updated.name = capitalizeName(extractedName)
          break
        }
      }
    }
    // Short message fallback: mensagem de 1-3 palavras tratada como nome.
    // Aceita quando começa com maiúscula OU (Story 75-161) quando a Nicole
    // ACABOU de perguntar o nome (nameExpected) — cobre respostas em minúsculas
    // como "maicon". Guarda contra falsos positivos via stoplist por palavra.
    if (!updated.name) {
      const trimmed = aiResponse.trim()
      const words = trimmed.split(/\s+/)
      const startsCapital = /^[A-ZÀ-Ÿ]/.test(trimmed)
      const allowLower = opts?.nameExpected === true && words.length >= 1 && words.length <= 2
      if (words.length >= 1 && words.length <= 3 && (startsCapital || allowLower)) {
        const candidate = words.filter((w) => /^[A-Za-zÀ-ÿ]+$/.test(w)).join(" ")
        const parts = candidate.toLowerCase().split(/\s+/).filter(Boolean)
        const hasStopword = parts.some((w) => NAME_STOPWORDS.has(w))
        if (candidate && !hasStopword && candidate.toLowerCase() !== "nicole" && candidate.length >= 2) {
          updated.name = capitalizeName(candidate)
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

  // Extract visit availability — only when a DAY reference is present.
  // Time-only mentions (10h, de manhã) are NOT sufficient to trigger scheduling.
  if (!updated.visit_availability) {
    // Keywords that confirm a day → set visit_availability
    const dayKeywords = [
      "sábado", "sabado", "domingo",
      "segunda-feira", "terça-feira", "terca-feira",
      "quarta-feira", "quinta-feira", "sexta-feira",
      "amanhã", "amanha", "hoje", "depois de amanhã", "depois de amanha",
      "semana que vem", "próxima semana", "proxima semana",
      "esse sábado", "esse sabado", "nesse sábado",
    ]

    // Keywords that indicate visit intent → set visit_availability
    const visitIntentKeywords = [
      "quero visitar", "quero conhecer", "quero ir",
      "posso ir", "posso visitar", "posso passar",
      "vou passar", "vou aí", "vou ai",
    ]

    const hasDayOrIntent = [...dayKeywords, ...visitIntentKeywords].some(
      (kw) => lower.includes(kw.toLowerCase())
    )

    // Story 75-245 — frase de HORÁRIO DE ATENDIMENTO ou lista de opções não é
    // disponibilidade do cliente. Esta função também roda sobre a resposta da
    // Nicole (pipeline.ts), e o "sábado" do "atendemos … sábado das 8h ao
    // meio-dia" gravava a frase inteira aqui — que virava agendamento fantasma
    // no turno seguinte (incidente do lead Ailton, 30/07/2026).
    if (hasDayOrIntent && !isAmbiguousSlotText(aiResponse)) {
      updated.visit_availability = aiResponse.trim()
    }
    // Time-only keywords (10h, de manhã, à tarde) intentionally excluded —
    // Nicole should ask for the day before scheduling
  }

  return updated
}

const VISIT_DAY_PATTERNS = [
  /\bs[aá]bado\b/, /\bdomingo\b/,
  /\bsegunda[-\s]?feira/,
  /\bter[cç]a(?:[-\s]?feira)?\b/, /\bquarta(?:[-\s]?feira)?\b/,
  /\bquinta(?:[-\s]?feira)?\b/, /\bsexta(?:[-\s]?feira)?\b/,
  /\bamanh[aã]/, /\bhoje\b/, /\bdepois de amanh/,
  /\bsemana que vem\b/,
  /\bpr[oó]xim[oa]\s+(?:semana|s[aá]bado|domingo|segunda|ter[cç]a|quarta|quinta|sexta)/,
  /\b\d{1,2}\/\d{1,2}\b/,
]

function hasDayRef(text: string): boolean {
  const lower = text.toLowerCase()
  return VISIT_DAY_PATTERNS.some((p) => p.test(lower))
}

/**
 * Extracts explicit visit confirmation from the client's message.
 * Called ONLY when visit_proposed === true (Nicole already asked about a date).
 * Requires both a day reference AND a positive/affirmative signal.
 * Returns the user message text if confirmed, null otherwise.
 */
export function extractVisitConfirmation(userMessage: string): string | null {
  const lower = userMessage.toLowerCase()

  // Explicit refusals → not a confirmation
  const refusals = [
    "não posso", "nao posso", "não consigo", "nao consigo",
    "não quero", "nao quero", "não vou", "nao vou",
    "talvez", "não sei", "nao sei", "preciso ver", "preciso pensar",
    "deixa eu ver", "ainda nao", "ainda não",
  ]
  if (refusals.some((r) => lower.includes(r))) return null

  // Must have a day reference
  if (!hasDayRef(userMessage)) return null

  // Must have a positive/affirmative signal
  const positiveSignals = [
    /^(sim|claro|ótimo|otimo|perfeito|tudo\s*bem|pode\s*ser|pode|ok|tá\s*bom|ta\s*bom|combinado|certo)\b/i,
    /\b(quero|vou|posso|consigo|dá|da|terei|topo|gostaria)\b/i,
    /\b(pode marcar|pode agendar|marque|agende|confirmo|confirmado|fechado)\b/i,
    /\b(vou\s+(?:estar|aparecer|lá|la|aí|ai))\b/i,
    /\b(me\s+encaixa|encaixa\s*bem|fica\s*bom|fica\s*ótimo)\b/i,
  ]
  if (!positiveSignals.some((p) => p.test(lower))) return null

  return userMessage.trim()
}
