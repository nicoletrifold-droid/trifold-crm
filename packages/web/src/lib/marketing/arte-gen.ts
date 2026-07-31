// Story 75-240 — geração de ARTE dos posts da Lídia: motor de imagem
// gemini-3.1-flash-image via Vertex AI Express (chave em VERTEX_API_KEY),
// com os arquivos do Kit de Marcas como imagens de referência.
// Validado em 29-30/07: texto em PT perfeito, logo aplicado, ~15s/arte.
//
// Fail-open SEMPRE: arte que falha não derruba o post — a copy vale sozinha
// e o "Refazer arte" tenta de novo.

import type { MarketingPostFormato } from "@web/lib/marketing/posts"

const VERTEX_MODEL = "gemini-3.1-flash-image"
const VERTEX_URL = `https://aiplatform.googleapis.com/v1/publishers/google/models/${VERTEX_MODEL}:generateContent`

/** Proporção da arte por formato (reel não gera imagem). */
export function aspectRatioForFormato(formato: MarketingPostFormato): "9:16" | "4:5" | "1:1" | null {
  switch (formato) {
    case "story":
      return "9:16"
    case "estatico":
      return "4:5"
    case "carrossel":
      return "1:1"
    case "reel":
      return null
  }
}

export interface ArteReferencia {
  mimeType: string
  /** bytes da imagem em base64 */
  data: string
}

export interface ArtePromptInput {
  /** Direção de arte vinda do Sonnet (composição, clima, texto NA arte) */
  descricao: string
  formato: MarketingPostFormato
  /** Nome da marca (contexto) */
  marca: string | null
  /** Cores {hex, nome} da marca (Kit) */
  cores: Array<{ hex: string; nome: string | null }>
  /** Nomes das fontes da marca (Kit) */
  fontes: string[]
  /** Ajuste do humano no "Refazer arte" (ex.: "menos texto, usa a piscina") */
  ajuste?: string | null
}

const FORMATO_ARTE: Record<Exclude<MarketingPostFormato, "reel">, string> = {
  story: "STORY vertical 9:16 para Instagram",
  estatico: "POST de feed 4:5 para Instagram",
  carrossel: "CAPA de carrossel 1:1 para Instagram",
}

/** Prompt do motor de imagem — puro e testável. */
export function buildArtePrompt(input: ArtePromptInput): string {
  const lines: string[] = []
  const tipo = input.formato === "reel" ? null : FORMATO_ARTE[input.formato]
  lines.push(
    `Crie uma arte de ${tipo ?? "post"} do mercado imobiliário de alto padrão${input.marca ? ` para a marca ${input.marca}` : ""}.`
  )
  lines.push("")
  lines.push("DIREÇÃO DE ARTE:")
  lines.push(input.descricao)
  if (input.cores.length > 0) {
    lines.push("")
    lines.push(
      `PALETA OBRIGATÓRIA da marca: ${input.cores
        .map((c) => `${c.hex}${c.nome ? ` (${c.nome})` : ""}`)
        .join(", ")}.`
    )
  }
  if (input.fontes.length > 0) {
    lines.push(`TIPOGRAFIA: estilo da(s) fonte(s) ${input.fontes.join(", ")} — moderna, elegante, alto contraste.`)
  }
  lines.push("")
  lines.push(
    "REGRAS: todo texto na arte em português do Brasil PERFEITO, sem erros de grafia; composição limpa com hierarquia clara e respiro; fotos de referência (quando houver) são a base visual — não distorcer arquitetura nem inventar fachadas diferentes das fotos."
  )
  lines.push("")
  // 75-246: o logo passou a ser COMPOSTO por cima (arte-logo.ts). O modelo não
  // desenha mais logo nenhum — desvio de forma/kerning era inevitável — e tem
  // de deixar a faixa inferior limpa para a aplicação.
  lines.push(
    "LOGO — NÃO DESENHE: as imagens de referência da marca servem apenas como guia de estilo, cor e clima. É PROIBIDO desenhar o logo, o nome da marca, assinatura, selo ou marca d'água na arte. O logo oficial é aplicado depois, por cima da imagem."
  )
  lines.push(
    "ÁREA RESERVADA (obrigatório): a faixa inferior da arte — os últimos 15% da altura — fica completamente limpa: só fundo, sem texto, sem logo, sem elemento gráfico. Todo texto, INCLUSIVE o CTA, fica acima dessa faixa."
  )
  lines.push("")
  // 75-244: a arte é vista no scroll do Instagram, no celular. Peça escura demais
  // e CTA em cinza discreto foram o que reprovou a 1ª leva de artes (31/07).
  lines.push(
    "CONTRASTE (obrigatório): a arte é vista no celular, no meio do scroll — todo texto tem que ser lido de relance. Texto claro SOMENTE sobre área escura, texto escuro SOMENTE sobre área clara; nunca cinza sobre fundo escuro. A arte NÃO pode ser quase toda preta ou monocromática escura: garanta uma área luminosa de verdade (céu, luz, reflexo, superfície clara) e posicione o título sobre ela ou sobre a região de maior contraste."
  )
  lines.push(
    "CTA (obrigatório): é o elemento mais importante depois do título — precisa de peso visual próprio, em corpo maior, com a cor de destaque da marca ou sobre pílula/faixa de fundo sólido. Nunca em cinza, nunca miúdo, nunca no limite da borda."
  )
  lines.push(
    "PROIBIDO: preencher espaço vazio com forma geométrica sem função, moldura ou bloco solto que não faça parte da composição."
  )
  if (input.ajuste?.trim()) {
    lines.push("")
    lines.push(`AJUSTE PEDIDO PELO HUMANO (prioridade máxima): ${input.ajuste.trim()}`)
  }
  return lines.join("\n")
}

export interface GerarArteResult {
  /** bytes da imagem */
  buffer: Buffer
  mimeType: string
}

/**
 * Chama o motor de imagem. Lança em erro de rede/HTTP; devolve null quando o
 * modelo não retornou imagem (ex.: recusa) — o chamador trata os dois como
 * "sem arte" (fail-open).
 */
export async function gerarArte(
  prompt: string,
  referencias: ArteReferencia[],
  aspectRatio: "9:16" | "4:5" | "1:1",
  apiKey: string
): Promise<GerarArteResult | null> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }]
  for (const ref of referencias) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
  }

  const res = await fetch(`${VERTEX_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio },
      },
    }),
    // O Vertex costuma responder em ~15s; 60s cobre picos sem estourar a função.
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Vertex ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>
  }
  const image = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
  if (!image?.data) return null
  return { buffer: Buffer.from(image.data, "base64"), mimeType: image.mimeType || "image/png" }
}

// Mimes que o Gemini aceita como referência inline (QA 75-240 #2: SVG passa
// no startsWith("image/") mas o Vertex recusa com 400 e mata a arte inteira).
export const REF_MIME_ALLOWLIST = ["image/png", "image/jpeg", "image/webp"] as const

/** Tipos de asset que podem virar referência VISUAL (fonte .ttf nunca). */
const REF_ASSET_TIPOS = new Set(["logo", "icone", "foto", "elemento"])

export interface ArteAssetCandidate {
  brand_id: string
  tipo: string
  file_name: string
  file_url: string
}

/**
 * Seleção PURA das referências da arte (QA 75-240 #5 — testável em unidade).
 * Ordem de prioridade:
 *   1. logo da identidade (depois ícone) — a marca SEMPRE entra primeiro
 *      (QA #3: antes, 4 fotos citadas espremiam o logo pra fora);
 *   2. arquivos citados pelo Sonnet, na ordem.
 * Empate de file_name entre marcas resolve pela ordem de `brandPriority`
 * (QA #10); arquivo de fonte nunca gasta slot (QA #7); dedup por file_name.
 */
export function selectArteReferencias(
  assets: ArteAssetCandidate[],
  brandPriority: string[],
  arquivosKit: string[],
  max = 4
): ArteAssetCandidate[] {
  const rank = (id: string) => {
    const i = brandPriority.indexOf(id)
    return i === -1 ? brandPriority.length : i
  }
  const imagens = assets
    .filter((a) => REF_ASSET_TIPOS.has(a.tipo))
    .sort((a, b) => rank(a.brand_id) - rank(b.brand_id))

  const out: ArteAssetCandidate[] = []
  const push = (a: ArteAssetCandidate | undefined) => {
    if (a && out.length < max && !out.some((e) => e.file_name === a.file_name)) out.push(a)
  }
  for (const brandId of brandPriority) {
    push(imagens.find((a) => a.brand_id === brandId && a.tipo === "logo"))
    if (imagens.some((a) => a.brand_id === brandId && a.tipo === "logo")) break // 1 logo basta
  }
  for (const brandId of brandPriority) {
    push(imagens.find((a) => a.brand_id === brandId && a.tipo === "icone"))
    if (out.some((a) => a.tipo === "icone")) break
  }
  for (const nome of arquivosKit) {
    push(imagens.find((a) => a.file_name === nome))
  }
  return out
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function arteFileExtension(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? "png"
}
