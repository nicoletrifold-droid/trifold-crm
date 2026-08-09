import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"
import { calculateQualificationScore } from "./qualification"

interface EnrichmentInput {
  messages: Array<{ role: string; content: string }>
  currentCollectedData: Record<string, unknown>
}

interface EnrichmentResult {
  summary: string
  extracted_data: Record<string, unknown>
}

/**
 * Story 87-4 / AC8-b — a linha `- visit_availability: string (dia/horario
 * mencionado)` FOI REMOVIDA desta lista, e a remoção é metade do conserto.
 *
 * Este prompt roda no cron `enrich-leads` a cada 30 min, sobre a conversa
 * INTEIRA (fala do lead E fala da Nicole), e o resultado ia direto para o
 * `collected_data` — fora do `processMessage`, sem citação, sem procedência, sem
 * âncora, sem TTL e sem passar pela guarda `isAmbiguousSlotText`. Era a SEGUNDA
 * linha de montagem do estado falso: dos 56 estados residuais medidos em
 * produção em 07/08, 39 (70 %) têm este cron como último escritor.
 *
 * A outra metade é o filtro no merge (`omitAgendaKeys`, em
 * `cron/enrich-leads/route.ts`): tirar só do prompt deixaria o merge aberto a um
 * modelo que devolvesse a chave por hábito de contexto.
 */
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
- profissao: string (profissao do lead, como ele disse; ex: "professora", "empresario")
- renda_familiar: "ate_2850" | "2850_4700" | "4700_8000" | "8000_12000" | "12000_20000" | "acima_20000" (SOMENTE se o lead falou valor/faixa de renda; mapeie o valor mencionado para a faixa em R$/mes)
- filhos: "nenhum" | "1" | "2" | "3_mais" (quantos filhos o lead disse ter)
- estado_civil: "solteiro" | "casado_uniao" | "divorciado" | "viuvo" (casado ou uniao estavel → "casado_uniao")
- faixa_etaria: "18_24" | "25_34" | "35_44" | "45_54" | "55_64" | "65_mais" (SOMENTE se o lead disse a idade; NUNCA deduza pelo tom da conversa)
- situacao_moradia: "aluguel" | "propria" | "com_familia" (onde/como mora hoje; "pago aluguel" → "aluguel", "moro com meus pais" → "com_familia")
- cidade_bairro: string (cidade e/ou bairro onde o lead mora hoje)
- tem_pet: "sim" | "nao" (se mencionou ter/nao ter animal de estimacao)

REGRAS:
- Retorne APENAS JSON valido, sem markdown, sem code blocks
- Em extracted_data, inclua SOMENTE campos que o lead mencionou explicitamente
- NAO invente dados — se o lead nao falou, nao inclua o campo
- Para os campos de enum (renda_familiar, filhos, estado_civil, faixa_etaria, situacao_moradia, tem_pet) use EXATAMENTE um dos valores listados — nunca outro texto
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
      model: ANTHROPIC_MODELS.haiku,
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
 * Story 75-183 — Campos de perfil (mig 179). Enums espelham os CHECKs do banco;
 * PERFIL_LEAD_FIELDS é usado pelo cron p/ o guard "não sobrescrever humano".
 */
const PERFIL_ENUM_FIELDS = {
  renda_familiar: ["ate_2850", "2850_4700", "4700_8000", "8000_12000", "12000_20000", "acima_20000"],
  filhos: ["nenhum", "1", "2", "3_mais"],
  estado_civil: ["solteiro", "casado_uniao", "divorciado", "viuvo"],
  faixa_etaria: ["18_24", "25_34", "35_44", "45_54", "55_64", "65_mais"],
  situacao_moradia: ["aluguel", "propria", "com_familia"],
  tem_pet: ["sim", "nao"],
} as const

export const PERFIL_LEAD_FIELDS = [
  "profissao",
  "renda_familiar",
  "filhos",
  "estado_civil",
  "faixa_etaria",
  "situacao_moradia",
  "cidade_bairro",
  "tem_pet",
] as const

/**
 * Story 75-183 — Guard "não sobrescrever humano": remove do patch qualquer campo de
 * PERFIL que já esteja preenchido no lead (corretor/manual — ou extração anterior —
 * sempre vence a IA). Score/summary não passam por aqui (continuam dinâmicos).
 * Muta e retorna o próprio patch, p/ uso in-place no cron.
 */
export function stripAlreadyFilledPerfil(
  patch: Record<string, unknown>,
  leadRow: Record<string, unknown>
): Record<string, unknown> {
  for (const field of PERFIL_LEAD_FIELDS) {
    if (leadRow[field] != null && leadRow[field] !== "" && field in patch) {
      delete patch[field]
    }
  }
  return patch
}

/**
 * Maps extracted_data fields to leads table column names.
 * Returns only non-null fields that should be updated.
 *
 * Story 87-4 / B2 — `existingLeadData` deve ser o `collected_data` que o chamador
 * VAI PERSISTIR, não o que ele leu do banco. O `qualification_score` é calculado
 * a partir de `{...existingLeadData, ...extractedData}`, e se esse objeto não for
 * o mesmo que vai para o `conversation_state` o cron e o `processMessage` passam
 * a discordar sobre o mesmo lead — com o cron sobrescrevendo a cada 30 min.
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

  // Story 75-183 — Perfil (marketing): enums validados contra os CHECKs da mig 179
  // (valor fora da lista é DESCARTADO — a extração nunca pode quebrar o CHECK).
  // Texto livre (profissao/cidade_bairro) é saneado: trim + limite de tamanho.
  for (const [field, allowed] of Object.entries(PERFIL_ENUM_FIELDS)) {
    const v = extractedData[field]
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) {
      patch[field] = v
    }
  }
  if (typeof extractedData.profissao === "string" && extractedData.profissao.trim()) {
    patch.profissao = extractedData.profissao.trim().slice(0, 80)
  }
  if (typeof extractedData.cidade_bairro === "string" && extractedData.cidade_bairro.trim()) {
    patch.cidade_bairro = extractedData.cidade_bairro.trim().slice(0, 120)
  }

  // Recalculate qualification score from merged data
  const mergedForScore = { ...existingLeadData, ...extractedData }
  const score = calculateQualificationScore(mergedForScore)
  patch.qualification_score = score
  patch.qualification_status = score >= 70 ? "qualified" : score > 0 ? "in_progress" : "not_started"
  patch.interest_level = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold"

  return patch
}

/**
 * Story 75-237 — "o corretor é superior ao sistema" (Marcos, 30/07).
 * A IA PODE definir a temperatura (o lead entra frio pelo sistema), mas quando um
 * humano muda, a escolha dele manda: `leads.interest_level_manual = true` impede
 * qualquer recálculo automático. Guard no mesmo espírito do
 * stripAlreadyFilledPerfil (75-183) — o score/summary seguem dinâmicos, só o
 * calor é protegido. Se o humano limpar p/ "Não definido", a flag volta a false
 * na rota e a IA reassume.
 */
export function stripManualInterestLevel(
  patch: Record<string, unknown>,
  lead: Record<string, unknown> | null | undefined
): void {
  // FAIL-SAFE (QA 75-237): lead que não pôde ser lido (erro/timeout no SELECT)
  // conta como manual. Sobrescrever o corretor por causa de uma falha
  // transitória seria justamente o bug que esta story conserta.
  if (!lead || lead.interest_level_manual === true) delete patch.interest_level
}
