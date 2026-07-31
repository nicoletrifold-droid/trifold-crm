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
  /** Story 75-241 — direção VISUAL do humano ("pôr do sol atrás do prédio").
   *  Vai ao Sonnet (incorporar na arte.descricao) E verbatim ao motor de imagem. */
  direcaoArte?: string | null
  /** Formato desejado */
  formato: MarketingPostFormato
  canal: "instagram" | "facebook"
  /** id de properties ou null para institucional */
  empreendimentoId: string | null
  /** Nome do empreendimento (contexto legível) ou null */
  empreendimentoNome: string | null
  /** Kit de Marcas — MESMO shape do Gerar sugestões (75-238) */
  brands: BrandKnowledge[]
  /** Arquivos do Kit da(s) marca(s) relevante(s): a Lídia escolhe quais entram na arte */
  assets: Array<{ marca: string; tipo: string; label: string | null; file_name: string }>
  /** Referência de "hoje" (ISO) */
  now: string
}

export interface MarketingPostRequestResult {
  copy: string
  /** Só quando formato=reel: roteiro de gravação (cenas, falas, texto de tela) */
  roteiro: string | null
  /** Por que a copy é assim + ajustes feitos por diretriz */
  justificativa: string
  /** Data futura sugerida YYYY-MM-DD ou null */
  scheduled_for: string | null
  /** Story 75-240 — direção de arte para o motor de imagem (null quando reel) */
  arte: {
    /** Descrição visual completa (composição, clima, texto NA arte) */
    descricao: string
    /** file_name EXATOS dos arquivos do Kit a usar como referência (pode ser vazio) */
    arquivos_kit: string[]
  } | null
}

const FORMATO_INSTRUCTIONS: Record<MarketingPostFormato, string> = {
  estatico:
    "FORMATO: post estatico de feed (imagem unica 4:5). Copy = legenda completa pronta para publicar (gancho forte na primeira linha, corpo, CTA, hashtags no final). Preencha o bloco arte.",
  reel:
    "FORMATO: reel (video curto vertical). Copy = legenda do reel (curta, gancho + CTA + hashtags). Campo roteiro OBRIGATORIO = roteiro de gravacao pronto para a equipe executar: duracao alvo (15-30s), cena a cena (o que filmar/mostrar), texto de tela de cada cena, fala/narracao se houver, e sugestao de audio/clima. O video e produzido por humanos — seja especifico e executavel. Bloco arte = null (reel nao gera imagem).",
  story:
    "FORMATO: story (tela vertical 9:16, some em 24h). Copy = texto DA TELA do story: curto, direto, com CTA de arrastar/link ('Saiba mais', 'Agende sua visita'). Maximo ~40 palavras. Se a narrativa pedir 2-3 telas, separe com 'TELA 1:', 'TELA 2:'. Preencha o bloco arte (a arte gerada e a TELA 1).",
  carrossel:
    "FORMATO: carrossel de feed. Copy = legenda completa + o conteudo de CADA CARD separado por 'CARD 1:', 'CARD 2:'… (4 a 7 cards; card 1 = capa com gancho, ultimo card = CTA). Preencha o bloco arte com a CAPA (card 1); os demais cards a equipe monta seguindo o mesmo estilo.",
}

const REQUEST_PROMPT_HEADER = `Voce e Lidia, a agente de marketing da Trifold (construtora/incorporadora de Maringa-PR). Um humano do time de marketing te fez um PEDIDO de post. Sua tarefa: entregar UM post pronto para a fila de aprovacao, seguindo o pedido, o formato e o conhecimento do Kit de Marcas abaixo.

REGRAS INEGOCIAVEIS:
- O Kit de Marcas e sua fonte de verdade. Siga a VOZ da marca; NUNCA viole uma DIRETRIZ — nem que o pedido mande. Se o pedido conflitar com uma diretriz, atenda o espirito do pedido sem violar a regra e explique o ajuste na justificativa.
- ESCOPO POR MARCA: use o bloco do empreendimento do post + o institucional. NUNCA aplique numero, diretriz ou caracteristica de um empreendimento a outro.
- So afirme numeros (preco, metragem, % vendido, prazo) que estejam no Kit. Prazo de entrega: SOMENTE o contratual.
- Portugues do Brasil. Emojis com moderacao (a voz da marca manda).
- BLOCO ARTE (formatos com imagem): "descricao" = direcao de arte COMPLETA para um gerador de imagem — composicao, clima, paleta com os HEX da marca, tipografia, e o TEXTO EXATO que aparece NA arte (titulo/subtitulo/CTA curtos; texto em portugues perfeito). "arquivos_kit" = file_name EXATOS da lista de ARQUIVOS DO KIT que devem entrar como referencia (logo da marca sempre que existir; foto citada no pedido quando houver). Se o pedido citar arquivo que nao existe, deixe fora, avise na justificativa e descreva o fundo ideal na descricao.
- LEGIBILIDADE DA ARTE (a descricao PRECISA cuidar disso; peca vista no celular, no meio do scroll): exija contraste alto entre texto e fundo — texto claro so sobre area escura, texto escuro so sobre area clara, nunca cinza sobre fundo escuro. NAO descreva a arte inteira como escura/preta/monocromatica: sempre reserve uma area luminosa (ceu, luz, reflexo, superficie clara) e diga onde o titulo entra. Descreva o CTA com peso visual proprio (corpo maior, cor de destaque da marca ou pilula/faixa de fundo solido) — CTA discreto ou pequeno e erro. Nao peca forma geometrica solta para preencher espaco.

RETORNE APENAS JSON valido, sem markdown:
{
  "copy": "texto conforme o formato",
  "roteiro": "roteiro de gravacao (SOMENTE formato reel; senao null)",
  "justificativa": "racional + ajustes feitos por diretriz",
  "scheduled_for": "YYYY-MM-DD ou null",
  "arte": { "descricao": "direcao de arte + texto da arte", "arquivos_kit": ["file_name"] }
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
${input.direcaoArte?.trim() ? `\nDIRECAO VISUAL DO HUMANO (obrigatorio incorporar na arte.descricao, com prioridade sobre suas escolhas esteticas): ${input.direcaoArte.trim()}\n` : ""}
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

    // Bloco arte (75-240): opcional e tolerante — arte ruim não derruba a copy.
    // Reel nunca tem arte; nos demais, sem descrição = sem arte (a rota pula a geração).
    let arte: MarketingPostRequestResult["arte"] = null
    if (formato !== "reel" && typeof p.arte === "object" && p.arte !== null) {
      const a = p.arte as Record<string, unknown>
      if (str(a.descricao)) {
        const arquivos = Array.isArray(a.arquivos_kit)
          ? (a.arquivos_kit as unknown[]).filter((f): f is string => typeof f === "string" && f.trim().length > 0).map((f) => f.trim())
          : []
        arte = { descricao: a.descricao.trim(), arquivos_kit: arquivos }
      }
    }

    return {
      copy: p.copy.trim(),
      roteiro: formato === "reel" ? roteiro : null,
      justificativa: p.justificativa.trim(),
      scheduled_for: scheduledFor,
      arte,
    }
  } catch {
    return null
  }
}
