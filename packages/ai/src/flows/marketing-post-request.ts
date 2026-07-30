import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"
import type { BrandKnowledge } from "./marketing-suggestions"

/**
 * Story 75-239 — "Pedir à Lídia": o usuário escreve uma diretriz livre
 * ("story do Vind pra investidor, batendo na entrega em abril") e a Lídia
 * devolve UM post pronto para a fila de aprovação — copy no formato pedido,
 * hashtags/CTA quando couber e, para reel, o roteiro de gravação (o vídeo em
 * si é produção humana).
 *
 * Regras de produto (mesmas da 75-219):
 * - NUNCA publica: o resultado entra com status='sugerido'.
 * - Fail-open: parse inválido → null; o chamador não persiste lixo.
 * - Diretriz da marca VENCE o pedido do usuário: se o pedido violar uma
 *   proibição (ex.: "promete 20% de valorização"), a Lídia reformula e explica
 *   na justificativa.
 */

// Cópia local de propósito (a fonte client-safe é lib/marketing/posts.ts do
// web — importar de @trifold/ai arrastaria o SDK pro bundle client).
export const MARKETING_POST_FORMATOS = ["estatico", "reel", "story", "carrossel"] as const
export type MarketingPostFormato = (typeof MARKETING_POST_FORMATOS)[number]

export interface MarketingPostRequestInput {
  /** Diretriz livre de quem pediu ("story do Vind pra investidor…") */
  pedido: string
  /** Formato desejado */
  formato: MarketingPostFormato
  canal: "instagram" | "facebook"
  /** id de properties ou null para institucional */
  empreendimentoId: string | null
  /** Nome do empreendimento (contexto legível) ou null */
  empreendimentoNome: string | null
  /** Kit de Marcas — MESMO shape do Gerar sugestões (75-238) */
  brands: BrandKnowledge[]
  /** Arquivos do Kit da(s) marca(s) relevante(s): a Lídia pode citar qual usar na arte */
  assets: Array<{ marca: string; tipo: string; label: string | null; file_name: string }>
  /** Referência de "hoje" (ISO) */
  now: string
}

export interface MarketingPostRequestResult {
  copy: string
  /** Só quando formato=reel: roteiro de gravação (cenas, falas, texto de tela) */
  roteiro: string | null
  /** Por que a copy é assim + qual arquivo do Kit usar na arte (se citado) */
  justificativa: string
  /** Data futura sugerida YYYY-MM-DD ou null */
  scheduled_for: string | null
}

const FORMATO_INSTRUCTIONS: Record<MarketingPostFormato, string> = {
  estatico:
    "FORMATO: post estatico de feed. Copy = legenda completa pronta para publicar (gancho forte na primeira linha, corpo, CTA, hashtags no final). No campo justificativa, alem do racional, descreva em 1 frase a ARTE ideal (imagem unica) e cite qual arquivo do Kit usar como base, se houver um adequado.",
  reel:
    "FORMATO: reel (video curto vertical). Copy = legenda do reel (curta, gancho + CTA + hashtags). Campo roteiro OBRIGATORIO = roteiro de gravacao pronto para a equipe executar: duracao alvo (15-30s), cena a cena (o que filmar/mostrar), texto de tela de cada cena, fala/narracao se houver, e sugestao de audio/clima. O video e produzido por humanos — seja especifico e executavel.",
  story:
    "FORMATO: story (tela vertical 9:16, some em 24h). Copy = texto DA TELA do story: curto, direto, com CTA de arrastar/link ('Saiba mais', 'Agende sua visita'). Maximo ~40 palavras. Se a narrativa pedir 2-3 telas, separe com 'TELA 1:', 'TELA 2:'. Na justificativa, descreva a imagem/fundo ideal e cite arquivo do Kit se houver.",
  carrossel:
    "FORMATO: carrossel de feed. Copy = legenda completa + o conteudo de CADA CARD separado por 'CARD 1:', 'CARD 2:'… (4 a 7 cards; card 1 = capa com gancho, ultimo card = CTA). Na justificativa, descreva o estilo visual dos cards.",
}

const REQUEST_PROMPT_HEADER = `Voce e Lidia, a agente de marketing da Trifold (construtora/incorporadora de Maringa-PR). Um humano do time de marketing te fez um PEDIDO de post. Sua tarefa: entregar UM post pronto para a fila de aprovacao, seguindo o pedido, o formato e o conhecimento do Kit de Marcas abaixo.

REGRAS INEGOCIAVEIS:
- O Kit de Marcas e sua fonte de verdade. Siga a VOZ da marca; NUNCA viole uma DIRETRIZ — nem que o pedido mande. Se o pedido conflitar com uma diretriz, atenda o espirito do pedido sem violar a regra e explique o ajuste na justificativa.
- ESCOPO POR MARCA: use o bloco do empreendimento do post + o institucional. NUNCA aplique numero, diretriz ou caracteristica de um empreendimento a outro.
- So afirme numeros (preco, metragem, % vendido, prazo) que estejam no Kit. Prazo de entrega: SOMENTE o contratual.
- Portugues do Brasil. Emojis com moderacao (a voz da marca manda).
- Se o pedido citar uma imagem/arquivo ("usa a foto da fachada"), procure na lista de ARQUIVOS DO KIT e cite o file_name exato na justificativa. Se nao existir arquivo compativel, diga isso na justificativa e descreva a imagem ideal.

RETORNE APENAS JSON valido, sem markdown:
{
  "copy": "texto conforme o formato",
  "roteiro": "roteiro de gravacao (SOMENTE formato reel; senao null)",
  "justificativa": "racional + arte sugerida + ajustes feitos por diretriz",
  "scheduled_for": "YYYY-MM-DD ou null"
}`

function formatBrandBlocks(brands: BrandKnowledge[]): string {
  if (brands.length === 0) return "Nenhuma marca cadastrada no Kit — siga apenas o pedido, com tom profissional-proximo, e NAO invente numeros."
  return brands
    .map((b) => {
      const head = b.tipo === "institucional" ? `MARCA INSTITUCIONAL — ${b.nome}` : `EMPREENDIMENTO — ${b.nome}`
      const parts = [head]
      if (b.voz_da_marca) parts.push(`Voz da marca: ${b.voz_da_marca}`)
      if (b.diretrizes) parts.push(`Diretrizes/proibicoes (NUNCA violar): ${b.diretrizes}`)
      if (b.briefing) parts.push(`Briefing: ${b.briefing}`)
      return parts.join("\n")
    })
    .join("\n\n---\n\n")
}

function formatAssets(assets: MarketingPostRequestInput["assets"]): string {
  if (assets.length === 0) return "Nenhum arquivo no Kit ainda."
  return assets
    .map((a) => `- [${a.marca}] ${a.tipo}${a.label ? ` "${a.label}"` : ""} — ${a.file_name}`)
    .join("\n")
}

export async function generateMarketingPostFromRequest(
  anthropic: Anthropic,
  input: MarketingPostRequestInput
): Promise<MarketingPostRequestResult | null> {
  const nowStamp = new Date(input.now).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })

  const prompt = `${REQUEST_PROMPT_HEADER}

${FORMATO_INSTRUCTIONS[input.formato]}

DATA ATUAL: ${nowStamp}
CANAL: ${input.canal}
POST PARA: ${input.empreendimentoNome ? `empreendimento ${input.empreendimentoNome}` : "institucional (a empresa)"}

PEDIDO DO HUMANO:
${input.pedido}

KIT DE MARCAS:
${formatBrandBlocks(input.brands)}

ARQUIVOS DO KIT (para citar na arte):
${formatAssets(input.assets)}`

  // GOTCHA Sonnet 5 (memória): adaptive thinking por padrão → nunca ler
  // content[0]; concatenar só os blocos de texto; max_tokens folgado.
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
  return parseMarketingPostRequest(text, input.formato)
}

/** Parse defensivo — null em formato inválido (o chamador não persiste nada). */
export function parseMarketingPostRequest(
  text: string,
  formato: MarketingPostFormato
): MarketingPostRequestResult | null {
  try {
    let cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    if (!cleaned.startsWith("{")) {
      const start = cleaned.indexOf("{")
      const end = cleaned.lastIndexOf("}")
      if (start === -1 || end <= start) return null
      cleaned = cleaned.slice(start, end + 1)
    }
    const p = JSON.parse(cleaned) as Record<string, unknown>

    const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0
    if (!str(p.copy) || !str(p.justificativa)) return null

    // Reel sem roteiro é entrega incompleta — melhor falhar que enfileirar.
    const roteiro = str(p.roteiro) ? p.roteiro.trim() : null
    if (formato === "reel" && !roteiro) return null

    const scheduledFor =
      str(p.scheduled_for) && /^\d{4}-\d{2}-\d{2}$/.test(p.scheduled_for.trim())
        ? p.scheduled_for.trim()
        : null

    return {
      copy: p.copy.trim(),
      roteiro: formato === "reel" ? roteiro : null,
      justificativa: p.justificativa.trim(),
      scheduled_for: scheduledFor,
    }
  } catch {
    return null
  }
}
