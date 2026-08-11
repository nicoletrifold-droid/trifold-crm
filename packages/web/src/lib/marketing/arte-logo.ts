// Story 75-246 — logo do Kit COMPOSTO sobre a arte, em vez de desenhado pelo
// modelo de imagem. Motivo (dívida medium do gate 75-244): nenhum modelo de
// difusão reproduz um logo com exatidão — desvio de forma/kerning é inevitável
// e não há como validar o resultado contra o asset do Kit.
//
// A parte de LAYOUT é pura e testável (AC5); só `composeLogo` toca no sharp.
// FAIL-OPEN por contrato (AC4): falha aqui devolve a arte SEM logo — nunca
// perde a peça inteira. A fila de aprovação humana é a rede de segurança.

import sharp from "sharp"

import type { ArteAssetCandidate } from "@web/lib/marketing/arte-gen"

export type ArteAspectRatio = "9:16" | "4:5" | "1:1"

/**
 * Mimes aceitos NA COMPOSIÇÃO — inclui SVG de propósito. A allowlist do Vertex
 * (`REF_MIME_ALLOWLIST`) recusa SVG, então logo vetorial hoje é descartado como
 * referência; aqui ele é o formato ideal, porque escala sem perda.
 */
export const LOGO_MIME_ALLOWLIST = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const

/**
 * Faixa inferior reservada ao logo, por formato. `bandRatio` é fração da ALTURA
 * e conversa com a regra de área limpa no prompt (AC2); `logoWidthRatio` é
 * fração da LARGURA. Story 9:16 tem faixa maior porque a UI do Instagram come o
 * rodapé — o logo precisa subir um pouco.
 */
const LAYOUT: Record<ArteAspectRatio, { bandRatio: number; logoWidthRatio: number }> = {
  "9:16": { bandRatio: 0.095, logoWidthRatio: 0.26 },
  "4:5": { bandRatio: 0.12, logoWidthRatio: 0.22 },
  "1:1": { bandRatio: 0.12, logoWidthRatio: 0.2 },
}

/** Fração da faixa que o logo pode ocupar em altura — o resto é respiro. */
const LOGO_HEIGHT_IN_BAND = 0.6

export interface LogoBox {
  /** teto de largura do logo, em px */
  maxWidth: number
  /** teto de altura do logo, em px */
  maxHeight: number
  /** y do topo da faixa reservada, em px */
  bandTop: number
  /** altura da faixa reservada, em px */
  bandHeight: number
}

/** PURA (AC5): caixa disponível para o logo dadas as dimensões reais da arte. */
export function logoBox(aspectRatio: ArteAspectRatio, width: number, height: number): LogoBox {
  const { bandRatio, logoWidthRatio } = LAYOUT[aspectRatio]
  const bandHeight = Math.round(height * bandRatio)
  return {
    maxWidth: Math.round(width * logoWidthRatio),
    maxHeight: Math.round(bandHeight * LOGO_HEIGHT_IN_BAND),
    bandTop: height - bandHeight,
    bandHeight,
  }
}

/**
 * PURA (AC5): posiciona o logo já redimensionado dentro da faixa.
 * 75-296: com CTA na peça, a pílula ocupa a esquerda da banda — o logo vai
 * para a DIREITA (margem 8%, espelhando a do CTA). Sem CTA, centralizado.
 */
export function logoPosition(
  box: LogoBox,
  logoWidth: number,
  logoHeight: number,
  artWidth: number,
  alinhamento: "centro" | "direita" = "centro"
): { left: number; top: number } {
  const margem = Math.round(artWidth * 0.08)
  return {
    left:
      alinhamento === "direita"
        ? Math.max(0, artWidth - margem - logoWidth)
        : Math.max(0, Math.round((artWidth - logoWidth) / 2)),
    top: Math.max(0, Math.round(box.bandTop + (box.bandHeight - logoHeight) / 2)),
  }
}

/**
 * PURA (AC3): escolhe QUAL asset vira o logo composto. Mesma semântica de
 * `selectArteReferencias` — logo da marca do empreendimento primeiro; se
 * nenhuma marca tiver logo, cai para ícone, também por prioridade.
 */
export function selectLogoAsset(
  assets: ArteAssetCandidate[],
  brandPriority: string[]
): ArteAssetCandidate | null {
  for (const tipo of ["logo", "icone"]) {
    for (const brandId of brandPriority) {
      const hit = assets.find((a) => a.brand_id === brandId && a.tipo === tipo)
      if (hit) return hit
    }
  }
  return null
}

/**
 * Compõe o logo sobre a arte. Devolve o buffer no MESMO formato de entrada
 * (`toBuffer()` sem chamar método de formato preserva o do input), para não
 * mexer na extensão/contentType que o arte-service já resolve.
 *
 * Lança em falha — o chamador trata como "arte sem logo" (AC4).
 */
export async function composeLogo(
  arte: Buffer,
  logo: Buffer,
  logoMime: string,
  aspectRatio: ArteAspectRatio,
  alinhamento: "centro" | "direita" = "centro"
): Promise<Buffer> {
  const meta = await sharp(arte).metadata()
  if (!meta.width || !meta.height) throw new Error("arte sem dimensões legíveis")

  const box = logoBox(aspectRatio, meta.width, meta.height)

  // SVG precisa de densidade alta na rasterização, senão sai serrilhado no
  // tamanho final. Para raster a opção é ignorada.
  const density = logoMime === "image/svg+xml" ? 300 : undefined
  const resized = await sharp(logo, density ? { density } : undefined)
    .resize({ width: box.maxWidth, height: box.maxHeight, fit: "inside" })
    .png() // preserva alfa do logo
    .toBuffer({ resolveWithObject: true })

  const { left, top } = logoPosition(box, resized.info.width, resized.info.height, meta.width, alinhamento)
  return sharp(arte).composite([{ input: resized.data, left, top }]).toBuffer()
}
