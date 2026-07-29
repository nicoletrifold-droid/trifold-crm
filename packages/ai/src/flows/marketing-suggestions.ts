import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"

/**
 * Story 75-219 — Agente de Marketing: geração de sugestões de posts.
 * Recebe a performance real das campanhas/criativos Meta (incluindo o
 * contraste cadastros brutos × funil CRM da RPC creative_performance) e os
 * empreendimentos ativos, e devolve 3–5 sugestões de post com justificativa
 * citando os dados que motivaram cada sugestão.
 *
 * Regras de produto:
 * - O agente NUNCA publica: as sugestões entram na fila com status='sugerido'.
 * - Fail-open: parse inválido → null; o chamador NUNCA persiste lixo.
 */

export interface CreativePerformanceRow {
  meta_ad_id: string
  ad_name: string | null
  total_spend: number | null
  total_impressions: number | null
  avg_ctr: number | null
  avg_cost_per_lead: number | null
  /** Cadastros brutos reportados pela Meta */
  total_leads: number | null
  /** Funil real no CRM (leads vinculados via ad_id) */
  crm_leads_total: number | null
  crm_leads_agendado: number | null
  crm_leads_visitou: number | null
  crm_leads_proposta: number | null
  crm_leads_fechado: number | null
}

export interface CampaignSummary {
  name: string
  status: string | null
  spend: number
  impressions: number
  clicks: number
  leads_meta: number
}

export interface PropertyOption {
  id: string
  name: string
  status: string | null
  city: string | null
  delivery_date: string | null
  differentials: unknown
}

export interface MarketingSuggestionsInput {
  /** Janela analisada, em dias (contexto para o modelo) */
  periodDays: number
  /** Performance por criativo (RPC creative_performance) */
  creatives: CreativePerformanceRow[]
  /** Visão agregada por campanha (meta_campaigns + meta_insights_daily) */
  campaigns: CampaignSummary[]
  /** Empreendimentos ativos disponíveis para divulgar */
  properties: PropertyOption[]
  /** Referência de "hoje" (ISO) para datas sugeridas */
  now: string
}

export interface MarketingPostSuggestion {
  /** id de properties ou null para post institucional */
  empreendimento_id: string | null
  canal: "instagram" | "facebook"
  copy: string
  /** Data sugerida (YYYY-MM-DD) ou null */
  scheduled_for: string | null
  /** Por que sugerir — DEVE citar dados concretos da performance */
  justificativa: string
}

const MAX_SUGGESTIONS = 5

const SUGGESTIONS_PROMPT = `Voce e Lidia, a agente de marketing de uma construtora/imobiliaria (Trifold). Com base na performance REAL das campanhas Meta Ads e do funil de vendas do CRM abaixo, sugira posts organicos para Instagram/Facebook.

COMO ANALISAR:
- Cruze cadastros brutos da Meta (total_leads) com o funil REAL do CRM (crm_leads_*): muitos cadastros com funil vazio = formato/publico ruim (aprendizado, nao sucesso); CPL baixo COM visitas/propostas no CRM = formato vencedor a reforcar.
- Priorize empreendimentos ativos com bom desempenho ou que precisam de mais divulgacao.
- Copy pronta para publicar: portugues do Brasil, tom profissional-proximo do mercado imobiliario, com CTA claro. Emojis com moderacao. NAO invente preco, metragem, prazo ou promocao que nao estejam nos dados.

REGRAS OBRIGATORIAS:
- Retorne APENAS JSON valido, sem markdown, sem code blocks.
- De 3 a 5 sugestoes, nem mais nem menos.
- "empreendimento_id" DEVE ser um id EXATO da lista de empreendimentos, ou null para post institucional.
- "canal" DEVE ser "instagram" ou "facebook".
- "justificativa" DEVE citar os dados concretos que motivaram a sugestao (ex.: "criativo X: CPL R$ 12 e 4 visitas em 30d", "campanha Y: 176 cadastros e 0 no funil -> evitar esse formato").
- "scheduled_for" e uma data futura sugerida no formato YYYY-MM-DD, ou null.

FORMATO DO JSON:
{
  "posts": [
    {
      "empreendimento_id": "uuid-ou-null",
      "canal": "instagram",
      "copy": "texto pronto do post",
      "scheduled_for": "YYYY-MM-DD",
      "justificativa": "dados concretos que motivaram"
    }
  ]
}`

function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—"
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

function formatCreatives(rows: CreativePerformanceRow[]): string {
  if (rows.length === 0) return "Nenhum criativo com dados no periodo."
  return rows
    .map(
      (r) =>
        `- ${r.ad_name ?? r.meta_ad_id}: spend R$ ${formatNumber(r.total_spend)}, ` +
        `impressoes ${formatNumber(r.total_impressions)}, CTR ${formatNumber(r.avg_ctr)}%, ` +
        `CPL R$ ${formatNumber(r.avg_cost_per_lead)}, cadastros Meta ${formatNumber(r.total_leads)} | ` +
        `funil CRM: ${formatNumber(r.crm_leads_total)} leads, ` +
        `${formatNumber(r.crm_leads_agendado)} agendaram, ${formatNumber(r.crm_leads_visitou)} visitaram, ` +
        `${formatNumber(r.crm_leads_proposta)} em proposta, ${formatNumber(r.crm_leads_fechado)} fecharam`
    )
    .join("\n")
}

function formatCampaigns(rows: CampaignSummary[]): string {
  if (rows.length === 0) return "Nenhuma campanha sincronizada."
  return rows
    .map(
      (c) =>
        `- ${c.name} (${c.status ?? "?"}): spend R$ ${formatNumber(c.spend)}, ` +
        `impressoes ${formatNumber(c.impressions)}, cliques ${formatNumber(c.clicks)}, ` +
        `cadastros Meta ${formatNumber(c.leads_meta)}`
    )
    .join("\n")
}

function formatProperties(rows: PropertyOption[]): string {
  if (rows.length === 0) return "Nenhum empreendimento ativo."
  return rows
    .map((p) => {
      const diffs = Array.isArray(p.differentials)
        ? (p.differentials as unknown[]).filter((d): d is string => typeof d === "string").join(", ")
        : ""
      return (
        `- id=${p.id} | ${p.name}` +
        (p.city ? ` (${p.city})` : "") +
        (p.status ? ` — status: ${p.status}` : "") +
        (p.delivery_date ? ` — entrega: ${p.delivery_date}` : "") +
        (diffs ? ` — diferenciais: ${diffs}` : "")
      )
    })
    .join("\n")
}

export async function generateMarketingSuggestions(
  anthropic: Anthropic,
  input: MarketingSuggestionsInput
): Promise<MarketingPostSuggestion[] | null> {
  const nowStamp = new Date(input.now).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  const prompt = `${SUGGESTIONS_PROMPT}

DATA ATUAL: ${nowStamp}
JANELA ANALISADA: ultimos ${input.periodDays} dias

EMPREENDIMENTOS ATIVOS (use o id EXATO ou null):
${formatProperties(input.properties)}

PERFORMANCE POR CRIATIVO (Meta × funil CRM, ${input.periodDays}d):
${formatCreatives(input.creatives)}

VISAO POR CAMPANHA (${input.periodDays}d):
${formatCampaigns(input.campaigns)}`

  // GOTCHA Sonnet 5 (memória + behavior-analysis.ts): adaptive thinking POR
  // PADRÃO → content[] traz bloco(s) "thinking" antes do "text". Nunca ler
  // content[0]; concatenar só os blocos de texto e max_tokens folgado.
  const response = await anthropic.messages.create(
    {
      model: ANTHROPIC_MODELS.sonnet,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: 75000 }
  )

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
  return parseMarketingSuggestions(text)
}

/**
 * Parse defensivo do JSON do modelo. Devolve null em qualquer formato
 * inválido — o chamador NUNCA insere nada quando o parse falha (fail-open).
 */
export function parseMarketingSuggestions(text: string): MarketingPostSuggestion[] | null {
  try {
    let cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    // Se o modelo escrever prosa em volta do JSON, recorta do primeiro "{"
    // ao último "}" antes de parsear (mesmo padrão do behavior-analysis).
    if (!cleaned.startsWith("{")) {
      const start = cleaned.indexOf("{")
      const end = cleaned.lastIndexOf("}")
      if (start === -1 || end <= start) return null
      cleaned = cleaned.slice(start, end + 1)
    }
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (!Array.isArray(parsed.posts)) return null

    const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

    const posts: MarketingPostSuggestion[] = []
    for (const raw of parsed.posts as unknown[]) {
      if (typeof raw !== "object" || raw === null) return null
      const p = raw as Record<string, unknown>

      if (p.canal !== "instagram" && p.canal !== "facebook") return null
      if (!str(p.copy) || !str(p.justificativa)) return null

      const empreendimentoId =
        p.empreendimento_id === null || p.empreendimento_id === undefined
          ? null
          : str(p.empreendimento_id)
            ? p.empreendimento_id.trim()
            : null

      const scheduledFor =
        str(p.scheduled_for) && /^\d{4}-\d{2}-\d{2}$/.test(p.scheduled_for.trim())
          ? p.scheduled_for.trim()
          : null

      posts.push({
        empreendimento_id: empreendimentoId,
        canal: p.canal,
        copy: p.copy.trim(),
        scheduled_for: scheduledFor,
        justificativa: p.justificativa.trim(),
      })
    }

    if (posts.length === 0) return null
    return posts.slice(0, MAX_SUGGESTIONS)
  } catch {
    return null
  }
}
