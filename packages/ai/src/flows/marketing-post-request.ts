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
  /**
   * Story 75-250 — paleta JÁ ESCOPADA (empreendimento ganha da institucional).
   * Sem isso o Sonnet era mandado escrever "os HEX da marca" sem nunca receber
   * hex algum, e usava o único disponível no contexto: o #F27A5E que está solto
   * no briefing da Trifold — laranja institucional numa arte de marca verde.
   */
  paleta?: Array<{ hex: string; nome: string | null }>
  /** Arquivos do Kit da(s) marca(s) relevante(s): a Lídia escolhe quais entram na arte */
  assets: Array<{ marca: string; tipo: string; label: string | null; file_name: string }>
  /** Referência de "hoje" (ISO) */
  now: string
  /**
   * Story 75-294 — destino TRÁFEGO PAGO: além do post, a Lídia devolve a copy
   * de anúncio (ad_primary_text ≤125 / ad_headline ≤27) coerente com o
   * objetivo. Ausente/organico = comportamento atual, intocado.
   */
  destino?: "organico" | "pago"
  /** Instrução do objetivo do anúncio (texto pronto, montado pelo chamador) */
  objetivoInstrucao?: string | null
}

export interface MarketingPostRequestResult {
  copy: string
  /** Só quando formato=reel: roteiro de gravação (cenas, falas, texto de tela) */
  roteiro: string | null
  /** Por que a copy é assim + ajustes feitos por diretriz */
  justificativa: string
  /** Data futura sugerida YYYY-MM-DD ou null */
  scheduled_for: string | null
  /**
   * Story 75-255 — UMA direção de arte POR TELA. `artes[0]` é a tela 1.
   * Story de 2 telas devolve 2 itens; carrossel devolve 1 (a capa); reel, null.
   * O campo `arte` singular continua exposto como `artes[0]` para não quebrar
   * quem já lê (retrocompatibilidade dos dois lados).
   */
  artes: Array<{
    descricao: string
    arquivos_kit: string[]
    cta: string | null
    /**
     * Story 75-256 — o TEXTO que vai na faixa inferior, composto por código.
     * Não é descrição de como desenhar: é o texto exato.
     */
    titulo: string | null
    subtitulo: string | null
  }> | null
  /**
   * Story 75-294 — copy de anúncio (só quando destino=pago; senão null).
   * Limites (125/27) são reforçados pelo chamador (enforceAdLimit).
   */
  ad_primary_text: string | null
  ad_headline: string | null
  /** @deprecated use `artes[0]` — mantido para não quebrar chamadas existentes */
  arte: {
    /** Descrição visual da CENA (75-256: sem texto — o texto é titulo/subtitulo) */
    descricao: string
    /** file_name EXATOS dos arquivos do Kit a usar como referência (pode ser vazio) */
    arquivos_kit: string[]
    /**
     * Story 75-248 — texto EXATO do CTA. Ele NÃO é desenhado pelo modelo de
     * imagem: o código compõe a pílula com a cor do Kit. null = sem CTA
     * composto (nunca inventar um).
     */
    cta: string | null
    titulo: string | null
    subtitulo: string | null
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
- BLOCO ARTES (Story 75-255) — **UMA ENTRADA POR TELA/CARD**: o campo "artes" e uma LISTA. Para formato 'story', devolva **uma entrada para CADA TELA** da copy (2 telas = 2 entradas), na mesma ordem — cada tela e uma imagem publicada, e sem isso a tela 2 sai sem arte. Para 'carrossel', devolva **apenas 1** entrada (a CAPA; os demais cards a equipe monta). Para 'estatico', 1. Para 'reel', "artes": null. Maximo 3 entradas.
- CADA ENTRADA de "artes" (Story 75-256 — o TEXTO SAIU DA IMAGEM):
  · "descricao" = direcao da CENA para o gerador de imagem: enquadramento, luz, clima, hora do dia, o que aparece. **NAO escreva texto nenhum aqui, nem peca texto na imagem** — a imagem e uma FOTOGRAFIA pura. Sem titulo, sem frase, sem numero, sem data, sem selo.
  · "titulo" = o texto EXATO do titulo da peca, curto e forte (ate 40 caracteres, ex.: "A OBRA AVANCA", "48 UNIDADES"). O codigo desenha ele numa faixa solida da marca, com a tipografia exata.
  · "subtitulo" = a linha de apoio, ate 60 caracteres (ex.: "Entrega contratual: abril de 2027", "Liberado para Airbnb"). null se nao houver.
  · "arquivos_kit" = file_name EXATOS da lista de ARQUIVOS DO KIT que devem entrar como referencia (logo da marca sempre que existir; foto citada no pedido quando houver). Se o pedido citar arquivo que nao existe, deixe fora, avise na justificativa e descreva a cena ideal na descricao.
- LUZ DA ARTE (a descricao PRECISA cuidar disso; peca vista no celular, no meio do scroll): NAO descreva a arte inteira como escura/preta/monocromatica — sempre garanta uma area luminosa de verdade (ceu, luz, reflexo, superficie clara). O QUARTO INFERIOR da imagem sera COBERTO por uma faixa solida da marca: nao coloque nada de importante ali (nem o horizonte, nem a base do predio). Nao peca forma geometrica solta, moldura ou linha decorativa para preencher espaco — isso e erro.
- COR (Story 75-250): use SOMENTE os hex listados em PALETA DA MARCA. E PROIBIDO escrever qualquer outro codigo hex na descricao — inclusive hex que apareca no briefing ou nas diretrizes de OUTRA marca. Se a secao PALETA DA MARCA estiver vazia, descreva a cor por NOME (ex.: "verde escuro", "areia") e nao escreva hex nenhum.
- CTA (Story 75-248): o campo "cta" recebe o texto EXATO do call-to-action, curto (ate ~30 caracteres, ex.: "Arraste e agende sua visita"). O CTA **NAO** e desenhado pelo gerador de imagem — o codigo compoe a pilula com a cor do Kit. Portanto: NAO descreva o CTA na "descricao" e NAO peca botao/pilula/texto de CTA na arte. Se o post nao pedir CTA, "cta": null.
- RESUMO DO QUE E IMAGEM E DO QUE E TEXTO: a "descricao" produz a FOTOGRAFIA. "titulo", "subtitulo" e "cta" produzem a TIPOGRAFIA, desenhada pelo codigo com as cores e a fonte exatas da marca. Nunca misture os dois — texto pedido dentro da descricao sai COBERTO pela faixa.

RETORNE APENAS JSON valido, sem markdown:
{
  "copy": "texto conforme o formato",
  "roteiro": "roteiro de gravacao (SOMENTE formato reel; senao null)",
  "justificativa": "racional + ajustes feitos por diretriz",
  "scheduled_for": "YYYY-MM-DD ou null",
  "artes": [{
    "descricao": "a CENA da TELA 1, sem texto algum",
    "titulo": "TITULO CURTO",
    "subtitulo": "linha de apoio ou null",
    "arquivos_kit": ["file_name"],
    "cta": "texto curto do CTA ou null"
  }]
}`

/**
 * Story 75-250 — a paleta chega ao Sonnet JÁ escopada. Antes ele era mandado
 * escrever "os HEX da marca" sem receber hex nenhum, e pegava o único do
 * contexto: o que está solto no briefing da Trifold.
 */
function formatPaleta(paleta: Array<{ hex: string; nome: string | null }>): string {
  if (paleta.length === 0) {
    return "Nenhuma cor cadastrada para esta marca — descreva as cores por NOME e NAO escreva hex algum."
  }
  return paleta.map((c) => `${c.hex}${c.nome ? ` (${c.nome})` : ""}`).join(", ")
}

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

  // Story 75-294 — bloco de tráfego pago: pede a copy de anúncio junto.
  const pagoBlock =
    input.destino === "pago"
      ? `

DESTINO: ANUNCIO DE TRAFEGO PAGO (Meta Ads), nao post organico. ${input.objetivoInstrucao ?? ""}
Alem dos campos usuais, devolva no MESMO JSON:
  "ad_primary_text": texto principal do anuncio, ate 125 caracteres, gancho forte + argumento central (sem hashtags),
  "ad_headline": titulo do anuncio, ate 27 caracteres, direto.
A "copy" continua sendo a legenda/descricao completa. A arte de anuncio precisa parar o scroll em menos de 1 segundo: UMA ideia visual central, contraste forte, zero poluicao.`
      : ""

  const prompt = `${REQUEST_PROMPT_HEADER}

${FORMATO_INSTRUCTIONS[input.formato]}${pagoBlock}

DATA ATUAL: ${nowStamp}
CANAL: ${input.canal}
POST PARA: ${input.empreendimentoNome ? `empreendimento ${input.empreendimentoNome}` : "institucional (a empresa)"}

PEDIDO DO HUMANO:
${input.pedido}
${input.direcaoArte?.trim() ? `\nDIRECAO VISUAL DO HUMANO (obrigatorio incorporar na arte.descricao, com prioridade sobre suas escolhas esteticas): ${input.direcaoArte.trim()}\n` : ""}
KIT DE MARCAS:
${formatBrandBlocks(input.brands)}

PALETA DA MARCA (os UNICOS hex permitidos na descricao da arte):
${formatPaleta(input.paleta ?? [])}

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
    // Story 75-255 — o contrato virou LISTA (`artes`), mas o parser aceita o
    // objeto `arte` antigo como lista de 1: nem resposta em cache do modelo nem
    // post existente quebram. Reel nunca tem arte.
    const brutas: unknown[] =
      formato === "reel"
        ? []
        : Array.isArray(p.artes)
          ? (p.artes as unknown[])
          : typeof p.arte === "object" && p.arte !== null
            ? [p.arte]
            : []

    const artes: NonNullable<MarketingPostRequestResult["artes"]> = []
    for (const bruta of brutas.slice(0, 3)) {
      if (typeof bruta !== "object" || bruta === null) continue
      const a = bruta as Record<string, unknown>
      if (!str(a.descricao)) continue
      const arquivos = Array.isArray(a.arquivos_kit)
        ? (a.arquivos_kit as unknown[]).filter((f): f is string => typeof f === "string" && f.trim().length > 0).map((f) => f.trim())
        : []
      const cta = str(a.cta) ? (a.cta as string).trim().slice(0, 60) : null
      // Story 75-256 — tolerante de propósito: título ausente ⇒ null ⇒ o
      // arte-service não compõe faixa e a arte sai no modo anterior. Resposta em
      // cache do modelo (sem os campos novos) não pode derrubar o post.
      const titulo = str(a.titulo) ? (a.titulo as string).trim().slice(0, 40) : null
      const subtitulo = str(a.subtitulo) ? (a.subtitulo as string).trim().slice(0, 60) : null
      artes.push({ descricao: (a.descricao as string).trim(), arquivos_kit: arquivos, cta, titulo, subtitulo })
    }

    // `arte` singular = artes[0], só para retrocompatibilidade de quem já lê.
    const arte: MarketingPostRequestResult["arte"] = artes[0] ?? null

    return {
      artes: artes.length > 0 ? artes : null,
      copy: p.copy.trim(),
      roteiro: formato === "reel" ? roteiro : null,
      justificativa: p.justificativa.trim(),
      scheduled_for: scheduledFor,
      arte,
      // Story 75-294 — tolerante: ausentes (destino orgânico, resposta antiga
      // em cache) viram null; o teto exato é reforçado no chamador.
      ad_primary_text: str(p.ad_primary_text) ? p.ad_primary_text.trim() : null,
      ad_headline: str(p.ad_headline) ? p.ad_headline.trim() : null,
    }
  } catch {
    return null
  }
}
