/**
 * Lead qualification flow.
 * Calculates qualification scores, determines next steps,
 * and extracts collected data from AI responses.
 */
import {
  isAmbiguousSlotText,
  parseDayParts,
  parseTimeParts,
  parsePeriodParts,
  dayPartsToIso,
} from "./visit-slot"
import { AGENDA_STATE_KEY, buildAgendaState, hasAgendaFact } from "./agenda-state"

/**
 * Story 75-347 — a régua de calor deixou de premiar "aceitou visita" acima de tudo.
 *
 * O que foi medido em produção (90 dias, 19/08) e motivou a mudança de dois pesos:
 *
 *  - **A ordem estava invertida.** No-show por calor do lead na hora da visita:
 *    `hot` 63,6% · `warm` 56,3% · `cold` 52,2%. Quem o sistema chamava de quente
 *    faltava MAIS que o frio — o oposto do que a régua promete.
 *  - **A causa, medida em 303 conversas:** 34 leads estavam `hot` e **28 deles
 *    (82%) só eram `hot` pelos 20 pontos de `visit_availability`**. Sem esse peso
 *    cairiam abaixo de 70. "Quente" queria dizer "aceitou marcar" — e aceitar
 *    marcar por educação é exatamente o que produz falta.
 *  - **`finalidade` valia zero** e estava nula em 83% dos leads (1.515 de 1.826),
 *    apesar de existir no banco desde a mig 154. É o dado que diz se o lead quer
 *    MORAR ou INVESTIR, o que muda a abordagem inteira — e ninguém perguntava.
 *
 * Efeito simulado nos dados reais antes de mudar: `hot` 34 → 24 (11 saem, 1 entra).
 * Os 11 que saem eram quentes só por terem aceitado uma visita.
 *
 * A soma segue **100** — o teste `pesos-somam-100` congela isso, porque os cortes
 * 70/40 de `interestLevelFromScore` só significam algo se o total não mudar.
 */
const SCORE_WEIGHTS: Record<string, number> = {
  name: 10,
  finalidade: 10,
  property_interest: 15,
  bedrooms: 10,
  floor: 10,
  view: 10,
  garages: 5,
  has_down_payment: 15,
  source: 5,
  visit_availability: 10,
}

const QUALIFICATION_STEPS = [
  "name",
  // Story 75-347 — a finalidade vem ANTES da ficha técnica: perguntar metragem,
  // andar e vista sem saber se é moradia ou investimento é ficha de corretor,
  // não conversa. O prompt `qualification-flow` tem a mesma ordem.
  "finalidade",
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
 * Story 87-4 — o campo de agenda mudou de nome e de forma (`visit_availability`
 * string → `agenda_state` objeto), mas o peso 20 e o passo de qualificação são
 * OS MESMOS. Esta função é o adaptador: aceita os dois formatos, para que uma
 * conversa ainda não tocada continue pontuando como pontuava.
 *
 * Por que isso importa mais do que parece (Risco 2 da story): o peso 20 é ~1/5
 * do score, e o score ≥ 70 é uma das condições do `shouldHandoff`. Uma regressão
 * de score muda o gatilho de handoff sem que ninguém associe as duas coisas.
 */
function fieldIsCollected(collectedData: Record<string, unknown>, field: string): boolean {
  if (field === "visit_availability") return hasAgendaFact(collectedData)
  const value = collectedData[field]
  return value !== undefined && value !== null && value !== ""
}

/**
 * Calculates a qualification score (0-100) based on collected data.
 * Each field contributes its weight when present and non-empty.
 */
export function calculateQualificationScore(
  collectedData: Record<string, unknown>
): number {
  let score = 0

  for (const [field, weight] of Object.entries(SCORE_WEIGHTS)) {
    if (fieldIsCollected(collectedData, field)) {
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
    if (!fieldIsCollected(collectedData, step)) {
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
  // Story 75-360 — o que a produção mostrou virando nome de lead em 45 dias:
  // "Já Comprei", "Morar", "E Aí", "Tá bom", "É parcelado", "Pede senha", "Até".
  "já", "ja", "comprei", "compramos", "comprar", "comprando", "vendi", "vender",
  "morar", "moradia", "morando", "moro", "mora", "alugar", "aluguel", "alugado",
  "investir", "investimento", "renda", "financiamento", "financiar", "parcelado",
  "parcela", "parcelas", "entrada", "senha", "pede", "peço", "manda", "mandar",
  "envia", "enviar", "ver", "vi", "vendo", "faz", "fez", "tempo", "ainda", "agora",
  "tá", "ta", "está", "esta", "estou", "to", "tô", "e", "é", "aí", "ai", "até",
  "ate", "depois", "amanhã", "amanha", "hoje", "ontem", "semana", "mes", "mês",
  "quanto", "quantos", "quanta", "qual", "quais", "onde", "quando", "como", "porque",
  "obg", "vlw", "certeza", "talvez", "pode", "posso", "consigo", "quanto",
])

/**
 * Story 75-360 — colapsa letras repetidas ("oii" → "oi", "simm" → "sim").
 *
 * A stoplist tinha "oi" e ainda assim gravou **"Oii"** como nome de lead em
 * 20/08/2026 (a Cleonice Viana perdeu o nome dela para o próprio cumprimento).
 * Caçar variante por variante — oii, oiii, oiiii — é jogo perdido; normalizar
 * antes de comparar resolve a família toda.
 */
export function normalizaParaStopword(palavra: string): string {
  return palavra.toLowerCase().replace(/(.)\1+/g, "$1")
}

/** A palavra é stopword, tolerando letra repetida ("Oii", "simm", "obggg")? */
function ehStopword(palavra: string): boolean {
  const p = palavra.toLowerCase()
  return NAME_STOPWORDS.has(p) || NAME_STOPWORDS.has(normalizaParaStopword(p))
}

/** Minúsculas sem acento, para comparar nome de gente ("Joao" == "João"). */
function semAcento(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Story 75-360 — o nome extraído pode SUBSTITUIR o que já está em `leads.name`?
 *
 * O bug de 20/08/2026: `pipeline.ts` fazia `leadPatch.name = finalData.name` sem
 * olhar o que havia lá. A guarda do extrator (`if (!updated.name)`) olha o
 * `collected_data` da CONVERSA, que vem vazio mesmo quando o lead chegou do Meta
 * com nome completo — e foi assim que "Melquiades Jesus" virou **"Já Comprei"**,
 * "Cleonice Viana" virou **"Oii"** e "Amauri" virou **"Morar"**, sem uma linha
 * de activity registrando a troca.
 *
 * Regra: lead SEM nome aceita qualquer extração; lead COM nome só aceita nome
 * que a pessoa DECLAROU ("meu nome é", "me chamo", "prazer, X"). Resposta curta a
 * uma pergunta é boa para preencher vazio, não para apagar o que o Meta ou o
 * corretor já sabiam.
 */
export function podeGravarNomeDoLead(
  nomeAtual: string | null | undefined,
  nomeNovo: unknown,
  origem: unknown
): boolean {
  if (typeof nomeNovo !== "string") return false
  const novo = nomeNovo.trim()
  if (!novo || novo.toLowerCase() === "nicole") return false

  const atual = (nomeAtual ?? "").trim()
  if (!atual) return true
  // Mesmo nome (só caixa, espaço ou ACENTO) não é troca: deixa passar para
  // corrigir "joao" → "João" sem exigir declaração. Comparação sem acento pela
  // mesma razão da busca de leads (`unaccent`) — "João" e "Joao" são a pessoa.
  if (semAcento(atual) === semAcento(novo)) return true

  return origem === "declarado"
}

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
  opts?: {
    nameExpected?: boolean
    /**
     * Story 87-4 — de QUEM é o texto. Só `"lead"` produz disponibilidade de
     * visita. FAIL-CLOSED de propósito: sem `origem` declarada, nenhum fato de
     * agenda é escrito.
     *
     * Esta função sempre rodou DUAS vezes por turno — uma sobre a mensagem do
     * lead (`pipeline.ts`, correto) e outra sobre a resposta da própria Nicole.
     * A segunda é a fonte do veneno: em produção, 10 de 13 `visit_availability`
     * inspecionados em 07/08 eram fala DELA — a pergunta "qual o melhor dia,
     * durante a semana ou sábado de manhã?" (Nilson), a saudação "Sou a Nicole…
     * como posso te ajudar hoje?" (Bianca, cujo "hoje" resolvia para a data de
     * cada leitura), até uma recusa do lead lida como disponibilidade (Maicon).
     *
     * A regra que fecha a classe inteira: **fato de agenda sem citação de uma
     * mensagem `role='user'` não pode virar estado.**
     */
    origem?: "lead" | "assistant"
    /** Story 87-4 — instante da ÂNCORA. O dia é resolvido aqui, uma vez, e nunca mais. */
    now?: Date
  }
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
          // Story 75-360 — a ORIGEM viaja junto: só nome DECLARADO ("meu nome é",
          // "me chamo", "prazer, X") tem autoridade para trocar um nome que já
          // existe. Chute de mensagem curta não tem.
          updated.name_origin = "declarado"
          break
        }
      }
    }
    // Short message fallback: mensagem de 1-3 palavras tratada como nome.
    // Aceita quando começa com maiúscula OU (Story 75-161) quando a Nicole
    // ACABOU de perguntar o nome (nameExpected) — cobre respostas em minúsculas
    // como "maicon". Guarda contra falsos positivos via stoplist por palavra.
    //
    // Story 75-360 — o gatilho continua o mesmo ("João Silva" mandado sozinho É um
    // nome, e o teste da 75-161 cobre isso), mas o que sai daqui é **inferido**, não
    // declarado: em 20/08/2026 este bloco leu "Oii", "Já comprei" e "Morar" como
    // nome. Duas mudanças, nesta ordem de importância:
    //   1. `podeGravarNomeDoLead` (abaixo, usada pelo pipeline) impede que um
    //      palpite APAGUE nome que o lead já tem. É a garantia estrutural.
    //   2. `ehStopword` normaliza letra repetida, então "Oii" cai junto com "oi".
    //      Stoplist é caça a caso — só vale como segunda camada.
    if (!updated.name) {
      const trimmed = aiResponse.trim()
      const words = trimmed.split(/\s+/)
      const startsCapital = /^[A-ZÀ-Ÿ]/.test(trimmed)
      const allowLower = opts?.nameExpected === true && words.length >= 1 && words.length <= 2
      if (words.length >= 1 && words.length <= 3 && (startsCapital || allowLower)) {
        const candidate = words.filter((w) => /^[A-Za-zÀ-ÿ]+$/.test(w)).join(" ")
        const parts = candidate.split(/\s+/).filter(Boolean)
        const hasStopword = parts.some((w) => ehStopword(w))
        if (candidate && !hasStopword && candidate.toLowerCase() !== "nicole" && candidate.length >= 2) {
          updated.name = capitalizeName(candidate)
          updated.name_origin = "inferido"
        }
      }
    }
  }

  // Story 75-347 — finalidade (moradia × investimento).
  //
  // 🔥 SOMENTE `origem: "lead"`, e isto não é preciosismo: a pergunta da própria
  // Nicole ("você busca pra morar ou como investimento?") contém as DUAS palavras.
  // Extrair da fala dela carimbaria a finalidade a partir da PERGUNTA, que é
  // exatamente o veneno da 87-4 — lá, 10 de 13 `visit_availability` inspecionados
  // em 07/08 eram fala dela, incluindo uma recusa do lead lida como disponibilidade.
  // Fato de qualificação sem citação de mensagem `role='user'` não vira estado.
  if (!updated.finalidade && opts?.origem === "lead") {
    const querMorar =
      /\b(?:pra|para)\s+(?:eu\s+)?morar\b/.test(lower) ||
      /\bmoradia\b/.test(lower) ||
      /\bmorar\s+(?:nele|nela|l[áa]|a[íi])\b/.test(lower) ||
      /\b(?:minha|nossa)\s+(?:fam[íi]lia|casa)\b/.test(lower) ||
      /\bpra\s+(?:mim|n[óo]s)\b/.test(lower) ||
      /\bprimeiro\s+(?:im[óo]vel|apartamento)\b/.test(lower) ||
      /\bsair\s+do\s+aluguel\b/.test(lower)
    const querInvestir =
      /\binvestimento\b/.test(lower) ||
      /\binvestir\b/.test(lower) ||
      /\bpra\s+alugar\b/.test(lower) ||
      /\b(?:para|pra)\s+loca[çc][ãa]o\b/.test(lower) ||
      /\bvaloriza[çc][ãa]o\b/.test(lower) ||
      /\brenda\s+(?:extra|passiva)\b/.test(lower) ||
      /\brentabilidade\b/.test(lower)

    if (querMorar && querInvestir) {
      updated.finalidade = "ambos"
    } else if (querMorar) {
      updated.finalidade = "moradia"
    } else if (querInvestir) {
      updated.finalidade = "investimento"
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
  //
  // Story 87-4 — o GATILHO é exatamente o mesmo de antes (mesma lista de
  // palavras, mesma guarda `isAmbiguousSlotText`): mudar o gatilho seria
  // caminho de decisão novo, proibido na Onda 1. O que muda são duas coisas, e
  // as duas são subtração:
  //   (a) só roda com `origem: "lead"` — a fala da Nicole deixa de virar estado;
  //   (b) o que se grava deixa de ser a STRING crua (que era reancorada a cada
  //       leitura) e passa a ser um `agenda_state` com o dia JÁ RESOLVIDO contra
  //       este instante, mais a citação literal e a validade.
  if (opts?.origem === "lead" && !updated[AGENDA_STATE_KEY]) {
    // Keywords that confirm a day → set agenda_state
    const dayKeywords = [
      "sábado", "sabado", "domingo",
      "segunda-feira", "terça-feira", "terca-feira",
      "quarta-feira", "quinta-feira", "sexta-feira",
      "amanhã", "amanha", "hoje", "depois de amanhã", "depois de amanha",
      "semana que vem", "próxima semana", "proxima semana",
      "esse sábado", "esse sabado", "nesse sábado",
    ]

    // Keywords that indicate visit intent → set agenda_state
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
      // Story 87-4 — A ÂNCORA. O dia relativo ("sábado", "amanhã") é resolvido
      // AQUI, uma única vez, contra o instante em que o lead falou. Depois disso
      // `data_absoluta` é uma data, não uma expressão — e nunca mais é reparseada.
      const now = opts.now ?? new Date()
      const day = parseDayParts(aiResponse, now)
      const time = parseTimeParts(aiResponse)
      updated[AGENDA_STATE_KEY] = buildAgendaState({
        citacao: aiResponse,
        now,
        // MENÇÃO: colhida de texto solto, sem termos perguntado nada. É o que o
        // `visit_availability` sempre foi — e é por isso que ela NÃO pode mexer
        // numa visita já marcada (ver `fonte` em `agenda-state.ts`).
        fonte: "mencao",
        dataAbsoluta: day ? dayPartsToIso(day) : null,
        hora: time?.hour ?? null,
        minuto: time?.minute ?? null,
        periodo: parsePeriodParts(aiResponse),
      })
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
