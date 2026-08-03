// Story 75-254 — quebra a copy do post em TELAS/CARDS para o preview.
//
// A copy já vem estruturada por marcador, porque o prompt do Sonnet manda:
//   story     → "TELA 1:", "TELA 2:" …
//   carrossel → "CARD 1:", "CARD 2:" …  (capa é o card 1)
//   estatico  → legenda única
//   reel      → legenda + roteiro em campo próprio
//
// ⚠️ GOTCHA REAL DOS DADOS: o marcador aparece em linha separada OU NO MEIO DA
// LINHA. Um post em produção tem "TELA 1: Vind. Obra avançando… TELA 2: Área de
// lazer…" tudo numa linha. Por isso quebramos pelo MARCADOR, nunca por linha.
//
// PURA (AC8): sem DOM, sem React.

import type { MarketingPostFormato } from "@web/lib/marketing/posts"

export type PreviewTipo = "story" | "carrossel" | "feed" | "reel" | "indefinido"

export interface PreviewTela {
  /** "Tela 1", "Card 2"… ou null quando é peça única */
  rotulo: string | null
  texto: string
  /** true só na tela/card que a arte gerada representa (AC3) */
  temArte: boolean
}

export interface PostPreview {
  tipo: PreviewTipo
  /** Proporção do mockup */
  aspecto: "9:16" | "4:5" | "1:1" | null
  telas: PreviewTela[]
  /** Legenda que vai embaixo do post (feed/carrossel/reel), não dentro da arte */
  legenda: string | null
}

/** story → TELA, carrossel → CARD. Aceita variação de caixa e espaçamento. */
function marcadorDe(tipo: PreviewTipo): RegExp | null {
  if (tipo === "story") return /\bTELA\s*(\d+)\s*[:\-–)]/gi
  if (tipo === "carrossel") return /\bCARD\s*(\d+)\s*[:\-–)]/gi
  return null
}

/**
 * PURA: quebra o texto nos marcadores. O que vier ANTES do primeiro marcador é
 * preservado como tela própria — risco 2 da story: descartar isso seria perda
 * SILENCIOSA de conteúdo.
 */
function quebrarPorMarcador(copy: string, re: RegExp, nome: string): PreviewTela[] {
  const matches = [...copy.matchAll(re)]
  if (matches.length === 0) return []

  const telas: PreviewTela[] = []

  const preambulo = copy.slice(0, matches[0]!.index!).trim()
  if (preambulo) telas.push({ rotulo: null, texto: preambulo, temArte: false })

  matches.forEach((m, i) => {
    const inicio = m.index! + m[0].length
    const fim = i + 1 < matches.length ? matches[i + 1]!.index! : copy.length
    telas.push({
      rotulo: `${nome} ${m[1]}`,
      texto: copy.slice(inicio, fim).trim(),
      temArte: false,
    })
  })

  return telas
}

/**
 * PURA (Story 75-263) — como se chama cada unidade da peça: story tem TELAS,
 * carrossel tem CARDS, e peça única não tem unidade nomeada.
 *
 * Existe para ser a fonte única desse vocabulário: ele nasceu aqui, no parser do
 * preview, e o card do post o duplicou ao passar a mostrar todas as artes. Duas
 * cópias divergiriam no dia em que um formato novo entrar.
 */
export function nomeDaUnidade(tipo: PreviewTipo): "Tela" | "Card" | null {
  if (tipo === "story") return "Tela"
  if (tipo === "carrossel") return "Card"
  return null
}

/** PURA: formato do post → tipo de preview. NULL (legado) vira "indefinido". */
export function tipoDePreview(formato: MarketingPostFormato | null): PreviewTipo {
  switch (formato) {
    case "story":
      return "story"
    case "carrossel":
      return "carrossel"
    case "estatico":
      return "feed"
    case "reel":
      return "reel"
    default:
      return "indefinido" // AC7 — 11 posts em produção com formato NULL
  }
}

const ASPECTO: Record<PreviewTipo, "9:16" | "4:5" | "1:1" | null> = {
  story: "9:16",
  carrossel: "1:1",
  feed: "4:5",
  reel: "9:16",
  indefinido: "4:5",
}

/**
 * PURA (AC8): monta o preview a partir do que já existe no post.
 *
 * 🔴 AC3 — `temArte` fica true SÓ na primeira tela/card, porque **o sistema gera
 * uma arte por post**. A tela 2 de um story não tem arte, e o preview mostra isso
 * com rótulo em vez de repetir a arte da tela 1. Repetir seria MENTIR, e mentir é
 * pior que não ter preview.
 */
export function buildPostPreview(input: {
  copy: string | null
  formato: MarketingPostFormato | null
  roteiro?: string | null
  temArteGerada: boolean
}): PostPreview {
  const tipo = tipoDePreview(input.formato)
  const copy = (input.copy ?? "").trim()

  // reel não tem arte (o vídeo é produção humana) — AC6
  if (tipo === "reel") {
    return {
      tipo,
      aspecto: ASPECTO[tipo],
      telas: input.roteiro?.trim()
        ? [{ rotulo: "Roteiro", texto: input.roteiro.trim(), temArte: false }]
        : [],
      legenda: copy || null,
    }
  }

  const re = marcadorDe(tipo)
  const nome = nomeDaUnidade(tipo) ?? "Card"
  const quebradas = re ? quebrarPorMarcador(copy, re, nome) : []

  // Sem marcador (ou formato de peça única): uma tela com a copy inteira.
  const telas: PreviewTela[] =
    quebradas.length > 0 ? quebradas : copy ? [{ rotulo: null, texto: copy, temArte: false }] : []

  // AC3 — a arte representa a PRIMEIRA tela/card, e só ela.
  if (input.temArteGerada && telas.length > 0) telas[0] = { ...telas[0]!, temArte: true }

  return {
    tipo,
    aspecto: ASPECTO[tipo],
    telas,
    // No story o texto é DA TELA (não há legenda embaixo). No feed/carrossel a
    // copy é a legenda que acompanha a imagem.
    legenda: tipo === "story" ? null : copy || null,
  }
}

// ─── Story 75-255 — quantas artes o post pede ───────────────────────────────

/** Teto de artes por post. Cada geração leva ~15s e a rota tem maxDuration=300. */
export const MAX_ARTES_POR_POST = 3

/**
 * PURA (AC8): quantas artes gerar, por formato.
 *
 * Não é "N para tudo" — cada formato tem intenção própria, e três delas já estavam
 * certas antes desta story:
 *   story     → UMA POR TELA (teto MAX_ARTES_POR_POST) ← o que a 75-255 conserta
 *   carrossel → só a CAPA. O prompt já diz "os demais cards a equipe monta
 *               seguindo o mesmo estilo" — intenção existente, não mexer.
 *   estatico  → 1 (peça única)
 *   reel      → 0 (o vídeo é produção humana)
 *   NULL      → 1 (legado pré-75-239; 11 posts em produção)
 */
export function quantasArtes(
  formato: MarketingPostFormato | null,
  totalTelas: number
): number {
  if (formato === "reel") return 0
  if (formato === "story") return Math.min(Math.max(totalTelas, 1), MAX_ARTES_POR_POST)
  return 1 // carrossel (capa), estatico, e legado sem formato
}
