// Story 75-256 — TÍTULO e SUBTÍTULO compostos por código, dentro de uma faixa
// OPACA que cobre a região inferior da arte.
//
// A virada de lógica desta story, e é o ponto todo dela: até aqui o código
// EVITAVA a região onde o modelo pudesse ter escrito (o CTA da 75-248 se
// posiciona dentro dos 25% que o prompt manda deixar limpos). Isso depende de
// obediência do modelo — e em 03/08, na Tela 2 do Vind, ele desobedeceu: escreveu
// o título dentro da área reservada e a pílula do CTA caiu por cima dele.
//
// Medido antes de escrever isto: a geometria estava CORRETA (pílula a 78% da
// altura, área reservada começando a 75%, 57px de folga). O problema nunca foi a
// conta. Então a faixa aqui é OPACA e cobre de `faixaTop` até a base: o que o
// modelo desenhou ali deixa de importar em vez de precisar ser prevenido.
//
// Quarta vez no mesmo ciclo que prompt não segura o que precisa ser exato:
// 75-244 (CTA desproporcional), 75-246 (invadiu 58px da faixa), 75-248 (ignorou
// a paleta), 75-256 (escreveu na área reservada).

import satori from "satori"
import sharp from "sharp"

import { hexToRgb, luminancia, pickTextColor, saturacao } from "@web/lib/marketing/arte-cta"
import { logoBox, type ArteAspectRatio } from "@web/lib/marketing/arte-logo"

/** Piso de legibilidade da faixa, em px. Mesma lição da 75-248: caixa de 2px
 *  "cabe" na matemática e é lixo na tela. */
const MIN_FAIXA_HEIGHT = 80

export const MAX_TITULO_CHARS = 40
export const MAX_SUBTITULO_CHARS = 60

/**
 * Alturas do TEXTO da pilha, como fração da ALTURA da arte.
 *
 * 🔴 `logo` e `cta` NÃO estão aqui, e isso é o ponto: eles vêm de `logoBox`
 * (75-246) e `ctaBox` (75-248), que são quem manda neles. A primeira versão
 * desta tabela tinha um `cta: 0.058` próprio — e o teste "a pílula do CTA nunca
 * invade o título" pegou na hora: o `ctaBox` real usa 0.062 com respiro de
 * 0.018, então a faixa empilhava o subtítulo 18px DENTRO da pílula.
 *
 * Ou seja: a mesma classe de bug que esta story existe para fechar (duas fontes
 * de verdade para uma geometria), cometida dentro dela. Consultar a fonte, nunca
 * reproduzir a constante.
 */
const PILHA: Record<ArteAspectRatio, { titulo: number; subtitulo: number; respiro: number }> = {
  "9:16": { titulo: 0.07, subtitulo: 0.038, respiro: 0.009 },
  // Formatos quadrados têm menos altura total, então o texto precisa de fração
  // maior para manter o corpo aparente — mas a 1ª régua (0.1/0.11) fazia a faixa
  // comer ~40% da peça no 1:1 (75-296, "olha o tamanho da tarja"). A imagem é o
  // que para o scroll; o título continua maior que o do 9:16 em fração, só não
  // engole mais a arte.
  "4:5": { titulo: 0.085, subtitulo: 0.05, respiro: 0.015 },
  "1:1": { titulo: 0.09, subtitulo: 0.052, respiro: 0.016 },
}

export interface TextoBox {
  left: number
  top: number
  width: number
  height: number
}

export interface FaixaLayout {
  /** largura da arte — a faixa sempre ocupa 100% dela */
  faixaWidth: number
  /** y onde a faixa opaca começa */
  faixaTop: number
  /** altura da faixa opaca (vai até a base da arte) */
  faixaHeight: number
  /** fração da altura ocupada pela faixa — é o que o prompt reserva (AC6) */
  fracaoReservada: number
  tituloBox: TextoBox
  subtituloBox: TextoBox | null
}

/**
 * PURA (AC1) — a ÚNICA fonte da geometria da faixa E da fração que o prompt
 * reserva. Duas fontes divergiriam em silêncio, que é exatamente a classe de
 * bug que esta story está fechando.
 *
 * Empilha de baixo para cima: [logo] ← respiro ← [cta?] ← respiro ← [subtítulo?] ← [título]
 */
export function faixaLayout(
  aspectRatio: ArteAspectRatio,
  width: number,
  height: number,
  opts: { temSubtitulo: boolean; temCta: boolean }
): FaixaLayout {
  const p = PILHA[aspectRatio]
  const respiro = Math.round(height * p.respiro)
  const hTitulo = Math.round(height * p.titulo)
  const hSub = opts.temSubtitulo ? Math.round(height * p.subtitulo) : 0

  // 75-296: o CTA deixou de ser um ANDAR da pilha — ele mora DENTRO da banda do
  // logo (ctaBox), à esquerda, com o logo à direita. O texto empilha direto
  // sobre a banda: um andar e um respiro a menos em toda peça com CTA.
  const baseTexto = logoBox(aspectRatio, width, height).bandTop

  // Empilha para CIMA a partir dessa base.
  const subTop = opts.temSubtitulo ? baseTexto - respiro - hSub : baseTexto - respiro
  const tituloTop = (opts.temSubtitulo ? subTop : baseTexto - respiro) - hTitulo

  // Respiro acima do título, dentro da faixa: sem isso o texto encosta na borda.
  const faixaTop = tituloTop - respiro
  const margem = Math.round(width * 0.08)

  return {
    faixaWidth: width,
    faixaTop,
    faixaHeight: height - faixaTop,
    fracaoReservada: (height - faixaTop) / height,
    tituloBox: { left: margem, top: tituloTop, width: width - margem * 2, height: hTitulo },
    subtituloBox: opts.temSubtitulo
      ? { left: margem, top: subTop, width: width - margem * 2, height: hSub }
      : null,
  }
}

/**
 * PURA (AC3) — cor da faixa: a mais ESCURA da paleta do Kit, **preferindo cor
 * de marca a neutro**.
 *
 * A primeira versão rejeitava tudo com luminância ≤ 0.02 "para não pegar preto",
 * e o teste com a paleta real do Vind reprovou: `#11220F` (o verde escuro da
 * marca, exatamente a cor da faixa que a peça já usava) tem luminância 0.013 —
 * caía no filtro. Cor de marca escura é o CASO DE USO, não a exceção.
 *
 * A regra correta é outra: entre as escuras, cor **cromática** ganha de neutra.
 * Kit com preto e com verde escuro deve produzir faixa verde — senão a peça
 * perde a identidade justamente no elemento mais visível dela.
 *
 * Paleta sem candidata ⇒ null ⇒ SEM faixa, e o prompt volta ao comportamento
 * anterior. Mesma regra da `pickAccentColor` da 75-248: **não inventamos cor**.
 */
export function pickBandColor(cores: Array<{ hex: string; nome?: string | null }>): string | null {
  const norm = (rgb: [number, number, number]) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`
  let declarada: { hex: string; lum: number } | null = null
  let cromatica: { hex: string; lum: number } | null = null
  let neutra: { hex: string; lum: number } | null = null

  for (const c of cores) {
    const rgb = hexToRgb(c.hex)
    if (!rgb) continue
    const lum = luminancia(rgb)
    // Teto: acima disso o título perde peso e a faixa deixa de ancorar a peça.
    if (lum > 0.6) continue

    const escolha = { hex: norm(rgb), lum }
    // Story 75-259 (AC1) — a INTENÇÃO declarada no Kit ganha da heurística. Sem
    // isto, a institucional da Trifold saía com faixa LARANJA (#F27A5E, "energia/
    // promo") em vez do #000000 que o próprio Kit chama de "fundo prioritário",
    // porque laranja é cromático e preto é neutro.
    if (nomeIndicaFundo(c.nome)) {
      if (!declarada || lum < declarada.lum) declarada = escolha
      continue
    }
    const alvo = saturacao(rgb) >= 0.15 ? "cromatica" : "neutra"
    const atual = alvo === "cromatica" ? cromatica : neutra
    if (!atual || lum < atual.lum) {
      if (alvo === "cromatica") cromatica = escolha
      else neutra = escolha
    }
  }
  // Declarada > cromática > neutra. A paleta do Vind tem `nome: null` nas três
  // cores e por isso PRECISA seguir caindo na heurística (AC2).
  return (declarada ?? cromatica ?? neutra)?.hex ?? null
}

/**
 * PURA — o cadastro escreve coisas como `"Primária (fundo prioritário)"`: com
 * acento, com maiúscula e com parênteses. Normaliza antes de casar.
 */
export function nomeIndicaFundo(nome: string | null | undefined): boolean {
  if (!nome) return false
  const n = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  return /\b(fundo|primaria|background)\b/.test(n)
}

/**
 * Avanço médio por caractere, em em. 0.58 é o da 75-248, medido para Montserrat
 * SemiBold em caixa mista. **Maiúscula é mais larga** — e o título vai em caixa
 * alta, então usar 0.58 nele subestimaria a largura e o satori quebraria a linha,
 * empurrando o texto para dentro da pílula do CTA.
 */
const AVANCO_CAIXA_MISTA = 0.58
const AVANCO_CAIXA_ALTA = 0.68

/**
 * PURA: corpo de fonte que caiba na caixa, pelo menor entre o limite de altura e
 * o de largura. Uma linha só — quebra de linha aqui estouraria a faixa.
 */
export function textoFontSize(
  texto: string,
  box: TextoBox,
  maxRatio = 0.62,
  avanco = AVANCO_CAIXA_MISTA
): number {
  const porAltura = Math.round(box.height * maxRatio)
  const porLargura = Math.floor(box.width / Math.max(1, texto.length * avanco))
  return Math.max(12, Math.min(porAltura, porLargura))
}

/** Rasteriza a faixa (fundo + título + subtítulo). Lança em falha — o chamador
 *  segue sem faixa (AC5, fail-open em camadas). */
export async function renderFaixa(
  titulo: string,
  subtitulo: string | null,
  layout: FaixaLayout,
  fundoHex: string,
  fonte: Buffer
): Promise<Buffer> {
  const cor = pickTextColor(fundoHex)
  // Caixa alta aplicada em JS, não por `textTransform`: o satori implementa um
  // subconjunto do CSS, e o corpo de fonte é calculado a partir DESTA string —
  // transformar depois, no render, mudaria a largura real sem o cálculo saber.
  const tituloUpper = titulo.toLocaleUpperCase("pt-BR")
  const children: Array<Record<string, unknown>> = [
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          width: "100%",
          justifyContent: "center",
          textAlign: "center",
          color: cor,
          fontFamily: "Marca",
          fontSize: textoFontSize(tituloUpper, layout.tituloBox, 0.62, AVANCO_CAIXA_ALTA),
          fontWeight: 600,
          letterSpacing: 0.5,
          lineHeight: 1.05,
        },
        children: tituloUpper,
      },
    },
  ]
  if (subtitulo && layout.subtituloBox) {
    children.push({
      type: "div",
      props: {
        style: {
          display: "flex",
          width: "100%",
          justifyContent: "center",
          textAlign: "center",
          color: cor,
          fontFamily: "Marca",
          fontSize: textoFontSize(subtitulo, layout.subtituloBox, 0.55),
          fontWeight: 600,
          // Subtítulo é hierarquia, não ruído: mesma cor com opacidade em vez de
          // um cinza que quebraria o contraste garantido pelo pickTextColor.
          opacity: 0.85,
          lineHeight: 1.15,
          marginTop: Math.round(layout.tituloBox.height * 0.18),
        },
        children: subtitulo,
      },
    })
  }

  const elemento = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        height: "100%",
        backgroundColor: fundoHex, // OPACO (AC2): é o que cobre o que o modelo escreveu
        paddingTop: layout.tituloBox.top - layout.faixaTop,
        paddingLeft: layout.tituloBox.left,
        paddingRight: layout.tituloBox.left,
      },
      children,
    },
  }

  const svg = await satori(elemento as unknown as Parameters<typeof satori>[0], {
    width: layout.faixaWidth,
    height: layout.faixaHeight,
    fonts: [{ name: "Marca", data: fonte, weight: 600, style: "normal" }],
  })
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Compõe a faixa sobre a arte. Lança em falha (AC5). */
export async function composeFaixa(
  arte: Buffer,
  titulo: string,
  subtitulo: string | null,
  aspectRatio: ArteAspectRatio,
  fundoHex: string,
  fonte: Buffer,
  temCta: boolean
): Promise<Buffer> {
  const meta = await sharp(arte).metadata()
  if (!meta.width || !meta.height) throw new Error("arte sem dimensões legíveis")

  const layout = faixaLayout(aspectRatio, meta.width, meta.height, {
    temSubtitulo: !!subtitulo?.trim(),
    temCta,
  })
  if (layout.faixaTop < 0 || layout.faixaHeight < MIN_FAIXA_HEIGHT) {
    throw new Error(`arte pequena demais para compor a faixa (ficaria com ${layout.faixaHeight}px)`)
  }

  const faixa = await renderFaixa(titulo, subtitulo, layout, fundoHex, fonte)
  return sharp(arte)
    .composite([{ input: faixa, left: 0, top: layout.faixaTop }])
    .toBuffer()
}
