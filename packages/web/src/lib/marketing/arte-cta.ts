// Story 75-248 — CTA COMPOSTO como pílula, com a cor de destaque do Kit.
//
// Por que sair do modelo (padrão de 3 rodadas): a 75-244 pediu "CTA com peso
// visual" e o modelo entregou um botão desproporcional; a 75-246 pediu faixa
// inferior limpa e ele invadiu 58px dela; e a paleta OBRIGATÓRIA do Kit foi
// simplesmente ignorada (arte coral numa marca verde). Instrução em prompt não
// segura o que precisa ser exato — cor de marca e CTA são exatos.
//
// Texto via `satori`, que converte texto em VETOR (SVG com <path>, zero <text>):
// é o que torna isso viável em serverless. Texto no `sharp` depende de
// Pango/fontconfig, ou seja de fonte instalada no sistema — inviável.

import { readFileSync } from "node:fs"
import path from "node:path"

import satori from "satori"
import sharp from "sharp"

import type { ArteAssetCandidate } from "@web/lib/marketing/arte-gen"
import { logoBox, type ArteAspectRatio } from "@web/lib/marketing/arte-logo"

/** Mimes de arquivo de fonte aceitos do Kit (satori lê ttf/otf/woff, NÃO woff2). */
export const FONTE_MIME_ALLOWLIST = ["font/ttf", "font/otf", "font/woff", "application/font-sfnt"] as const

/**
 * Fonte empacotada: é a que o Kit do Vind NOMEIA. OFL, ver fonts/OFL.txt.
 *
 * O 1º candidato é o padrão do repo para asset em disco (`process.cwd()` +
 * caminho literal, igual a `app/sw/route.ts`, que roda em produção há meses e
 * é o que o file tracing do Next reconhece). O 2º existe porque o vitest roda
 * da RAIZ do monorepo, não de `packages/web`.
 */
const RELATIVO = "src/lib/marketing/fonts/Montserrat-SemiBold.ttf"
const CANDIDATOS = [path.join(process.cwd(), RELATIVO), path.join(process.cwd(), "packages/web", RELATIVO)]

let fontePadraoCache: Buffer | null = null
export function fontePadrao(): Buffer {
  if (fontePadraoCache) return fontePadraoCache
  for (const p of CANDIDATOS) {
    try {
      fontePadraoCache = readFileSync(p)
      return fontePadraoCache
    } catch {
      // tenta o próximo
    }
  }
  throw new Error(`fonte padrão não encontrada (tentados: ${CANDIDATOS.join(", ")})`)
}

// ─── Cor ────────────────────────────────────────────────────────────────────

/** PURA: #rgb ou #rrggbb → [r,g,b] 0-255. null se não parseável. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** PURA: luminância relativa WCAG (0 = preto, 1 = branco). */
export function luminancia(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** PURA: razão de contraste WCAG entre duas cores. */
export function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** PURA: saturação HSL — usada para achar a cor de DESTAQUE da paleta. */
export function saturacao(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const l = (max + min) / 2
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
}

/**
 * PURA (AC3): cor de destaque da paleta do Kit = a mais cromática, ignorando
 * quase-branco e quase-preto (que são fundo/texto, não destaque).
 * Paleta sem candidato ⇒ null: NÃO inventa cor, o CTA sai sem composição.
 */
export function pickAccentColor(cores: Array<{ hex: string }>): string | null {
  let melhor: { hex: string; sat: number } | null = null
  for (const c of cores) {
    const rgb = hexToRgb(c.hex)
    if (!rgb) continue
    const l = luminancia(rgb)
    if (l > 0.85 || l < 0.05) continue // quase-branco / quase-preto
    const sat = saturacao(rgb)
    if (sat < 0.15) continue // cinza não é destaque
    if (!melhor || sat > melhor.sat) melhor = { hex: `#${hexToRgb(c.hex)!.map((v) => v.toString(16).padStart(2, "0")).join("")}`, sat }
  }
  return melhor?.hex ?? null
}

/** PURA (AC4): texto preto ou branco sobre a pílula — o que der mais contraste. */
export function pickTextColor(fundoHex: string): "#000000" | "#FFFFFF" {
  const rgb = hexToRgb(fundoHex)
  if (!rgb) return "#FFFFFF"
  return contraste(rgb, [0, 0, 0]) >= contraste(rgb, [255, 255, 255]) ? "#000000" : "#FFFFFF"
}

// ─── Layout ─────────────────────────────────────────────────────────────────

const MIN_PILL_HEIGHT = 24 // piso de legibilidade da pílula, em px

export interface CtaBox {
  width: number
  height: number
  left: number
  top: number
}

/**
 * PURA (AC5, redesenhada na 75-296): a pílula do CTA mora DENTRO da banda do
 * logo — à ESQUERDA (margem 8%), verticalmente centralizada, com o logo à
 * direita. Antes ela era um andar próprio acima da banda, e a pilha completa
 * (título+subtítulo+CTA+logo) comia ~40% do 1:1.
 */
export function ctaBox(aspectRatio: ArteAspectRatio, width: number, height: number): CtaBox {
  const logo = logoBox(aspectRatio, width, height)
  const h = Math.min(Math.round(height * 0.05), Math.round(logo.bandHeight * 0.62))
  const w = Math.round(width * 0.46)
  const margem = Math.round(width * 0.08)
  return {
    width: w,
    height: h,
    left: margem,
    top: logo.bandTop + Math.round((logo.bandHeight - h) / 2),
  }
}

/**
 * PURA: corpo da fonte que caiba na pílula. Montserrat SemiBold tem avanço
 * médio ≈ 0.58em; o menor entre o limite de altura e o de largura ganha.
 */
export function ctaFontSize(texto: string, box: CtaBox): number {
  const padding = Math.round(box.height * 0.5)
  const porAltura = Math.round(box.height * 0.4)
  const porLargura = Math.floor((box.width - padding * 2) / Math.max(1, texto.length * 0.58))
  return Math.max(12, Math.min(porAltura, porLargura))
}

// ─── Composição ─────────────────────────────────────────────────────────────

/**
 * Story 75-259 — peso da fonte deduzido do NOME do arquivo. Menor = mais pesado.
 *
 * O `satori` recebe `fontWeight: 600` mas renderiza com o arquivo que a gente
 * entrega: CSS não sintetiza negrito. Então **o arquivo escolhido é a única coisa
 * que decide o peso real** do título e do CTA.
 */
const PESO_POR_NOME: Array<{ re: RegExp; rank: number }> = [
  { re: /black|heavy/i, rank: 0 },
  { re: /extra[\s_-]?bold|ultra[\s_-]?bold/i, rank: 1 },
  { re: /semi[\s_-]?bold|demi[\s_-]?bold/i, rank: 2 },
  { re: /bold/i, rank: 3 },
  { re: /medium/i, rank: 4 },
  { re: /regular|book|normal/i, rank: 5 },
  { re: /extra[\s_-]?light|ultra[\s_-]?light|thin|hairline/i, rank: 7 },
  { re: /light/i, rank: 6 },
]

/** PURA (AC3): 0 = mais pesada. 5.5 = nome sem indicação de peso (entre regular e light). */
export function pesoDaFonte(fileName: string): number {
  // A ordem da tabela importa: "extrabold" contém "bold", "extralight" contém
  // "light". O primeiro match ganha, e os compostos vêm antes dos simples.
  for (const { re, rank } of PESO_POR_NOME) if (re.test(fileName)) return rank
  return 5.5
}

/** Acima disto a fonte é leve demais para título — cai na empacotada (AC4). */
export const PESO_LEVE_DEMAIS = 6

/**
 * PURA: escolhe o arquivo de fonte do Kit (prioridade de marca), se houver.
 *
 * Story 75-259: era `assets.find(...)` — **o primeiro que aparecesse**. A consulta
 * que alimenta os candidatos não tem `ORDER BY`, então o peso do texto composto
 * era decidido pela ordem que o Postgres devolveu. O Kit do Vind tem Light,
 * Medium e Regular (nenhuma SemiBold): o título de ~100px podia sair fino, e
 * mudar de um dia para o outro sem ninguém alterar nada.
 */
export function selectFonteAsset(
  assets: ArteAssetCandidate[],
  brandPriority: string[]
): ArteAssetCandidate | null {
  for (const brandId of brandPriority) {
    const daMarca = assets.filter((a) => a.brand_id === brandId && a.tipo === "fonte")
    if (daMarca.length === 0) continue
    // Empate de peso resolve por file_name, para ser determinístico de verdade —
    // o Kit do Vind tem `Montserrat-Light.ttf` cadastrada DUAS vezes.
    return (
      [...daMarca].sort(
        (a, b) => pesoDaFonte(a.file_name) - pesoDaFonte(b.file_name) || a.file_name.localeCompare(b.file_name)
      )[0] ?? null
    )
  }
  return null
}

/** Rasteriza a pílula do CTA. Lança em falha — o chamador segue sem CTA (AC7). */
export async function renderCtaPill(
  texto: string,
  box: CtaBox,
  fundoHex: string,
  fonte: Buffer
): Promise<Buffer> {
  // O satori aceita a árvore como objeto simples em runtime, mas tipa o 1º
  // argumento como ReactNode — daí o cast. Objeto em vez de JSX de propósito:
  // este é um módulo .ts de servidor, sem React envolvido.
  const elemento = {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: fundoHex,
        borderRadius: 9999,
        color: pickTextColor(fundoHex),
        fontFamily: "Marca",
        fontSize: ctaFontSize(texto, box),
        fontWeight: 600,
        letterSpacing: 0.3,
        textAlign: "center",
        lineHeight: 1.1,
      },
      children: texto,
    },
  }

  const svg = await satori(elemento as unknown as Parameters<typeof satori>[0], {
    width: box.width,
    height: box.height,
    fonts: [{ name: "Marca", data: fonte, weight: 600, style: "normal" }],
  })
  // satori devolve SVG com <path> (texto vetorizado) — o sharp rasteriza sem
  // precisar de fonte no sistema.
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Compõe a pílula sobre a arte. Lança em falha (AC7). */
export async function composeCta(
  arte: Buffer,
  texto: string,
  aspectRatio: ArteAspectRatio,
  fundoHex: string,
  fonte: Buffer
): Promise<Buffer> {
  const meta = await sharp(arte).metadata()
  if (!meta.width || !meta.height) throw new Error("arte sem dimensões legíveis")
  const box = ctaBox(aspectRatio, meta.width, meta.height)
  // Piso de legibilidade: sem isso uma arte minúscula produz uma pílula de 2px,
  // que "cabe" na matemática e é lixo na tela. Só dispara abaixo de ~390px de
  // altura — arte real do motor tem 768+.
  if (box.top < 0 || box.height < MIN_PILL_HEIGHT) {
    throw new Error(`arte pequena demais para compor o CTA (pílula ficaria com ${box.height}px)`)
  }
  const pill = await renderCtaPill(texto, box, fundoHex, fonte)
  return sharp(arte).composite([{ input: pill, left: box.left, top: box.top }]).toBuffer()
}
