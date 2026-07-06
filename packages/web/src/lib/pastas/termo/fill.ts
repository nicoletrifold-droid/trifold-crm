// Story 75-127 — Motor de preenchimento do Termo de Intenção (modelo YARDEN).
// Carimba texto no PDF-modelo em branco nas coordenadas dos campos e marca os
// checkboxes (fluxo de pagamento + PIX). Mantém logo, marca d'água, QR e dados PIX.
//
// As coordenadas vêm do PDF original (origem TOPO-esquerda); o pdf-lib usa origem
// BASE-esquerda → converte y = pageHeight - bottom + BASELINE_LIFT.
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib"
import { TEMPLATE_YARDEN_B64 } from "./template-yarden"

export type FluxoPagamento = "fluxo_30_70" | "fluxo_100_obra" | "plano_safra" | "plano_investidor"

export interface TermoEndereco {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
}

export interface TermoPessoa {
  nome?: string | null
  profissao?: string | null
  celular?: string | null
  email?: string | null
}

export interface TermoData {
  /** Nome 1 = interessado (PF) ou razão social (PJ). */
  nome1?: string | null
  profissao?: string | null
  celular?: string | null
  email?: string | null
  endereco?: TermoEndereco | null
  /** Linha "Cônjuge" (PF casado/união estável). */
  conjuge?: TermoPessoa | null
  corretor?: string | null
  imobiliaria?: string | null
  fluxoPagamento?: FluxoPagamento | null
  /** true → "Farei o PIX" (Grupo 1); false → "Não farei o PIX" (Grupo 2). */
  temPix?: boolean
  data?: { dia?: string | null; mes?: string | null } | null
}

const BASELINE_LIFT = 2 // levanta a baseline ~2pt do fundo da célula
const SIZE = 9

// Marca do checkbox por fluxo (bottom Y do quadrado, do PDF original).
const FLUXO_Y: Record<FluxoPagamento, number> = {
  fluxo_30_70: 516,
  fluxo_100_obra: 566,
  plano_safra: 603,
  plano_investidor: 633,
}
const PIX_Y = { grupo1: 691, grupo2: 742 } // Farei / Não farei
const CHECK_X = 85.5

/** Preenche o Termo de Intenção (modelo YARDEN) e devolve os bytes do PDF. */
export async function fillTermo(data: TermoData): Promise<Uint8Array> {
  const bytes = Buffer.from(TEMPLATE_YARDEN_B64, "base64")
  const pdf = await PDFDocument.load(bytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()
  const p0 = pages[0]
  const p1 = pages[1]
  if (!p0) throw new Error("Template do Termo inválido (sem páginas)")
  const H0 = p0.getHeight()

  const put = (page: PDFPage, x: number, bottom: number, text: string | null | undefined, pageH: number, size = SIZE) => {
    const t = (text ?? "").toString().trim()
    if (!t) return
    page.drawText(t, { x, y: pageH - bottom + BASELINE_LIFT, size, font: font as PDFFont, color: rgb(0, 0, 0) })
  }

  // ---- Página 1 (interessados / origem) ----
  put(p0, 149, 165, data.nome1, H0)
  put(p0, 397, 165, data.profissao, H0)
  put(p0, 149, 178, data.celular, H0)
  put(p0, 293, 178, data.email, H0)
  const e = data.endereco ?? {}
  put(p0, 149, 192, e.logradouro, H0)
  put(p0, 392, 192, e.numero, H0)
  put(p0, 483, 192, e.complemento, H0)
  put(p0, 149, 205, e.cidade, H0)
  put(p0, 300, 205, e.uf, H0)
  put(p0, 413, 205, e.cep, H0)

  // Cônjuge
  const c = data.conjuge ?? {}
  put(p0, 149, 218, c.nome, H0)
  put(p0, 397, 218, c.profissao, H0)
  put(p0, 149, 231, c.celular, H0)
  put(p0, 293, 231, c.email, H0)

  // corretor / imobiliária
  put(p0, 139, 381, data.corretor, H0)
  put(p0, 390, 381, data.imobiliaria, H0)

  // Fluxo de pagamento (X)
  if (data.fluxoPagamento && FLUXO_Y[data.fluxoPagamento]) {
    put(p0, CHECK_X, FLUXO_Y[data.fluxoPagamento], "X", H0)
  }
  // PIX: Grupo 1 (farei) x Grupo 2 (não farei)
  put(p0, CHECK_X, data.temPix ? PIX_Y.grupo1 : PIX_Y.grupo2, "X", H0)

  // ---- Página 2 (data) ----
  if (p1 && data.data) {
    const H1 = p1.getHeight()
    put(p1, 455, 659, data.data.dia, H1)
    put(p1, 489, 659, data.data.mes, H1)
  }

  return pdf.save()
}
