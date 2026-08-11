// Story 75-256 — testes das partes PURAS da faixa. O que importa aqui não é
// "a conta fecha": é que a faixa COBRE a região onde o modelo pode ter escrito,
// e que a fração dita ao prompt seja a mesma que vai ser coberta.

import { describe, expect, it } from "vitest"

import { ctaBox } from "@web/lib/marketing/arte-cta"
import {
  faixaLayout,
  nomeIndicaFundo,
  pickBandColor,
  textoFontSize,
  MAX_SUBTITULO_CHARS,
  MAX_TITULO_CHARS,
} from "@web/lib/marketing/arte-faixa"
import { logoBox, type ArteAspectRatio } from "@web/lib/marketing/arte-logo"

const FORMATOS: Array<{ ar: ArteAspectRatio; w: number; h: number }> = [
  { ar: "9:16", w: 1080, h: 1920 },
  { ar: "4:5", w: 1080, h: 1350 },
  { ar: "1:1", w: 1080, h: 1080 },
]

const COMBOS = [
  { temSubtitulo: false, temCta: false },
  { temSubtitulo: true, temCta: false },
  { temSubtitulo: false, temCta: true },
  { temSubtitulo: true, temCta: true },
]

describe("faixaLayout (AC1)", () => {
  it("cobre os 3 formatos × 4 combinações sem geometria inválida", () => {
    for (const { ar, w, h } of FORMATOS) {
      for (const opts of COMBOS) {
        const l = faixaLayout(ar, w, h, opts)
        expect(l.faixaTop, `${ar} ${JSON.stringify(opts)}`).toBeGreaterThan(0)
        expect(l.faixaHeight).toBe(h - l.faixaTop)
        expect(l.faixaWidth).toBe(w)
        // a faixa nunca pode comer metade da peça (teto), e nunca pode ficar
        // tão fina que o título não caiba (piso). 75-260 baixou os dois: o caso
        // mínimo (só título) agora dá ~18%, contra 25% antes.
        expect(l.fracaoReservada).toBeLessThan(0.42)
        expect(l.fracaoReservada).toBeGreaterThan(0.15)
      }
    }
  })

  it("o título fica DENTRO da faixa, com respiro acima", () => {
    for (const { ar, w, h } of FORMATOS) {
      const l = faixaLayout(ar, w, h, { temSubtitulo: true, temCta: true })
      expect(l.tituloBox.top).toBeGreaterThan(l.faixaTop)
      expect(l.tituloBox.top + l.tituloBox.height).toBeLessThanOrEqual(h)
    }
  })

  it("subtítulo vem DEPOIS do título e não o invade", () => {
    const l = faixaLayout("9:16", 1080, 1920, { temSubtitulo: true, temCta: true })
    expect(l.subtituloBox).not.toBeNull()
    expect(l.subtituloBox!.top).toBeGreaterThanOrEqual(l.tituloBox.top + l.tituloBox.height)
  })

  it("sem subtítulo não devolve caixa de subtítulo", () => {
    const l = faixaLayout("9:16", 1080, 1920, { temSubtitulo: false, temCta: true })
    expect(l.subtituloBox).toBeNull()
  })

  it("75-296: CTA não é mais um andar — com ou sem CTA a faixa tem a MESMA altura", () => {
    const semCta = faixaLayout("9:16", 1080, 1920, { temSubtitulo: true, temCta: false })
    const comCta = faixaLayout("9:16", 1080, 1920, { temSubtitulo: true, temCta: true })
    expect(comCta.faixaHeight).toBe(semCta.faixaHeight)
  })

  it("75-296 (AC4): frações-alvo — pago 1:1 (só título) ≤26%; orgânico completo 1:1 ≤31%; pago 9:16 ≤19%", () => {
    const pago11 = faixaLayout("1:1", 1080, 1080, { temSubtitulo: false, temCta: false })
    expect(pago11.fracaoReservada).toBeLessThanOrEqual(0.26)
    const organico11 = faixaLayout("1:1", 1080, 1080, { temSubtitulo: true, temCta: true })
    expect(organico11.fracaoReservada).toBeLessThanOrEqual(0.31)
    const pago916 = faixaLayout("9:16", 1080, 1920, { temSubtitulo: false, temCta: false })
    expect(pago916.fracaoReservada).toBeLessThanOrEqual(0.19)
  })

  /**
   * 🔴 O teste que representa o BUG DA STORY.
   * Em 03/08 a pílula do CTA caiu sobre o título porque o título era desenhado
   * pelo modelo, em lugar que o código não conhecia. Agora que o código desenha
   * os dois, a pílula tem de ficar ABAIXO do texto, sempre.
   */
  it("a pílula do CTA nunca invade o título nem o subtítulo", () => {
    for (const { ar, w, h } of FORMATOS) {
      const l = faixaLayout(ar, w, h, { temSubtitulo: true, temCta: true })
      const pill = ctaBox(ar, w, h)
      const baseDoTexto = l.subtituloBox!.top + l.subtituloBox!.height
      expect(pill.top, `${ar}: pílula em ${pill.top}, texto termina em ${baseDoTexto}`).toBeGreaterThanOrEqual(
        baseDoTexto
      )
    }
  })

  it("75-296: a pílula mora DENTRO da banda do logo, e o texto empilha acima dela", () => {
    for (const { ar, w, h } of FORMATOS) {
      const l = faixaLayout(ar, w, h, { temSubtitulo: true, temCta: true })
      const pill = ctaBox(ar, w, h)
      const logo = logoBox(ar, w, h)
      expect(pill.top).toBeGreaterThanOrEqual(logo.bandTop)
      expect(pill.top + pill.height).toBeLessThanOrEqual(logo.bandTop + logo.bandHeight)
      // o texto (subtítulo) termina antes da banda começar
      expect(l.subtituloBox!.top + l.subtituloBox!.height).toBeLessThanOrEqual(logo.bandTop)
      expect(l.faixaTop).toBeLessThan(l.tituloBox.top)
      expect(logo.bandTop).toBeGreaterThan(l.faixaTop)
    }
  })

  /**
   * AC6 — a fração dita ao prompt É a fração coberta. Se alguém mexer na PILHA
   * sem mexer no prompt (ou vice-versa), isto quebra.
   */
  it("fracaoReservada é exatamente faixaHeight/height", () => {
    for (const { ar, w, h } of FORMATOS) {
      for (const opts of COMBOS) {
        const l = faixaLayout(ar, w, h, opts)
        expect(l.fracaoReservada).toBeCloseTo(l.faixaHeight / h, 10)
      }
    }
  })
})

describe("pickBandColor (AC3)", () => {
  it("escolhe a cor mais ESCURA da paleta", () => {
    // paleta real do Vind (Kit): branco, verde muito escuro, verde claro
    const cores = [{ hex: "#FFFFFF" }, { hex: "#11220F" }, { hex: "#8FE6A7" }]
    expect(pickBandColor(cores)).toBe("#11220f")
  })

  /**
   * Regra corrigida durante a implementação: a versão inicial rejeitava
   * luminância ≤ 0.02 "para não pegar preto" e reprovou com a paleta REAL do
   * Vind — `#11220F` tem luminância 0.013. Cor de marca escura é o caso de uso.
   * O que vale é: entre escuras, cromática ganha de neutra.
   */
  it("prefere a cor de MARCA ao neutro, mesmo que o neutro seja mais escuro", () => {
    expect(pickBandColor([{ hex: "#000000" }, { hex: "#11220F" }])).toBe("#11220f")
  })

  it("usa preto do Kit quando é a única escura — está na paleta, não foi inventado", () => {
    expect(pickBandColor([{ hex: "#000000" }, { hex: "#FFFFFF" }])).toBe("#000000")
  })

  it("ignora cor clara demais — o título perderia peso", () => {
    expect(pickBandColor([{ hex: "#FFFFFF" }, { hex: "#F5F5F5" }])).toBeNull()
  })

  it("paleta vazia ou inválida devolve null — NUNCA inventa cor", () => {
    expect(pickBandColor([])).toBeNull()
    expect(pickBandColor([{ hex: "nao-e-cor" }, { hex: "#GGG" }])).toBeNull()
  })

  it("aceita hex de 3 dígitos", () => {
    expect(pickBandColor([{ hex: "#123" }])).toBe("#112233")
  })
})

describe("textoFontSize", () => {
  it("nunca desce abaixo do piso de 12px", () => {
    const box = { left: 0, top: 0, width: 40, height: 10 }
    expect(textoFontSize("um título absurdamente longo para esta caixa", box)).toBe(12)
  })

  it("título curto ganha corpo maior que título longo na mesma caixa", () => {
    const box = { left: 86, top: 0, width: 908, height: 163 }
    const curto = textoFontSize("48 UNIDADES", box)
    const longo = textoFontSize("A OBRA AVANÇA E A ENTREGA ESTÁ CHEGANDO", box)
    expect(curto).toBeGreaterThan(longo)
  })

  it("caixa alta pede avanço maior — e portanto corpo MENOR — que caixa mista", () => {
    const box = { left: 86, top: 0, width: 908, height: 163 }
    const misto = textoFontSize("A obra avança agora", box, 0.62, 0.58)
    const alta = textoFontSize("A OBRA AVANÇA AGORA", box, 0.62, 0.68)
    expect(alta).toBeLessThan(misto)
  })

  /**
   * O risco concreto: se o corpo ficar largo demais, o satori quebra a linha e o
   * texto desce para dentro da pílula do CTA — o mesmo sintoma que a story veio
   * consertar. Uma linha do título tem de caber na largura da caixa.
   */
  it("o título estimado cabe em UMA linha na largura da caixa", () => {
    const l = faixaLayout("9:16", 1080, 1920, { temSubtitulo: true, temCta: true })
    for (const t of ["48 UNIDADES", "A OBRA AVANÇA", "ENTREGA CONTRATUAL ABRIL DE 2027 CONFIRMADA"]) {
      const upper = t.toLocaleUpperCase("pt-BR")
      const fs = textoFontSize(upper, l.tituloBox, 0.62, 0.68)
      expect(upper.length * fs * 0.68, `"${t}"`).toBeLessThanOrEqual(l.tituloBox.width)
    }
  })

  it("respeita o teto de altura da caixa", () => {
    const box = { left: 0, top: 0, width: 5000, height: 100 }
    expect(textoFontSize("OI", box)).toBeLessThanOrEqual(Math.round(100 * 0.62))
  })
})

describe("limites de texto", () => {
  it("os tetos são os mesmos que o parser do Sonnet aplica", () => {
    expect(MAX_TITULO_CHARS).toBe(40)
    expect(MAX_SUBTITULO_CHARS).toBe(60)
  })
})

// ─── AC2 — a prova de que a faixa COBRE ──────────────────────────────────────
// Sem rede e sem Vertex: uma imagem sintética faz o papel da arte, com um
// retângulo vermelho onde o modelo "escreveu" o título indevidamente (o bug real
// de 03/08). Depois de compor a faixa, aquele pixel tem de ser da cor da faixa.

describe("composeFaixa (AC2) — cobre o que o modelo escreveu", () => {
  it("pixel dentro da região da faixa deixa de ser o do modelo", async () => {
    const { default: sharp } = await import("sharp")
    const { composeFaixa } = await import("@web/lib/marketing/arte-faixa")
    const { fontePadrao } = await import("@web/lib/marketing/arte-cta")

    const W = 1080
    const H = 1920
    const layout = faixaLayout("9:16", W, H, { temSubtitulo: true, temCta: true })
    // y bem dentro da faixa, onde o modelo desenhou o título na Tela 2 do Vind
    const yInvasor = layout.tituloBox.top + 10

    // arte sintética: fundo azul + faixa VERMELHA atravessando a região invadida
    const base = await sharp({
      create: { width: W, height: H, channels: 3, background: "#0000ff" },
    })
      .composite([
        {
          input: {
            create: { width: W, height: 60, channels: 3, background: "#ff0000" },
          },
          left: 0,
          top: yInvasor - 20,
        },
      ])
      .png()
      .toBuffer()

    // confirma que o "texto do modelo" está lá ANTES
    const antes = await sharp(base).extract({ left: 5, top: yInvasor, width: 1, height: 1 }).raw().toBuffer()
    expect([antes[0], antes[1], antes[2]]).toEqual([255, 0, 0])

    const composta = await composeFaixa(base, "A OBRA AVANÇA", "Entrega em abril", "9:16", "#11220f", fontePadrao(), true)

    // DEPOIS: o mesmo pixel é da cor da faixa (#11220f), não mais vermelho
    const depois = await sharp(composta)
      .extract({ left: 5, top: yInvasor, width: 1, height: 1 })
      .raw()
      .toBuffer()
    expect([depois[0], depois[1], depois[2]]).toEqual([0x11, 0x22, 0x0f])

    // e um pixel ACIMA da faixa segue intocado (a imagem não foi destruída)
    const acima = await sharp(composta)
      .extract({ left: 5, top: Math.max(0, layout.faixaTop - 30), width: 1, height: 1 })
      .raw()
      .toBuffer()
    expect([acima[0], acima[1], acima[2]]).toEqual([0, 0, 255])
  })
})

// ─── Story 75-259 — a faixa obedece ao que o Kit declara ─────────────────────

describe("pickBandColor com nome declarado (75-259, AC1/AC2)", () => {
  // As três paletas REAIS de produção, copiadas de marketing_brands em 03/08.
  const TRIFOLD = [
    { hex: "#000000", nome: "Primária (fundo prioritário)" },
    { hex: "#F27A5E", nome: "Laranja (energia/promo)" },
    { hex: "#2E2E2E", nome: "Cinza de apoio" },
    { hex: "#FFFFFF", nome: "Branco de apoio" },
  ]
  const VIND = [{ hex: "#FFFFFF", nome: null }, { hex: "#11220F", nome: null }, { hex: "#8FE6A7", nome: null }]
  const YARDEN = [
    { hex: "#002338", nome: "Primária" },
    { hex: "#F8E8D8", nome: "Secundária" },
    { hex: "#FACB9D", nome: "Destaque" },
  ]

  /**
   * 🔴 O BUG DA STORY: antes disto a institucional saía com faixa LARANJA, porque
   * laranja é cromático e preto é neutro — contrariando o próprio Kit, que chama
   * o preto de "fundo prioritário".
   */
  it("Trifold institucional usa o PRETO declarado como fundo, não o laranja de promo", () => {
    expect(pickBandColor(TRIFOLD)).toBe("#000000")
  })

  it("Vind (cores sem nome) segue na heurística e devolve o verde escuro (AC2)", () => {
    expect(pickBandColor(VIND)).toBe("#11220f")
  })

  it("Yarden usa a Primária, que também é a mais escura", () => {
    expect(pickBandColor(YARDEN)).toBe("#002338")
  })

  it("entre duas declaradas como fundo, a mais escura ganha", () => {
    const cores = [{ hex: "#333333", nome: "Fundo claro" }, { hex: "#0A0A0A", nome: "fundo escuro" }]
    expect(pickBandColor(cores)).toBe("#0a0a0a")
  })

  it("nome declarado NÃO fura o teto de luminância — fundo claro não vira faixa", () => {
    const cores = [{ hex: "#F5F5F5", nome: "Primária (fundo)" }, { hex: "#11220F", nome: null }]
    expect(pickBandColor(cores)).toBe("#11220f")
  })
})

describe("nomeIndicaFundo", () => {
  it("casa com acento, maiúscula e parênteses — como o cadastro real escreve", () => {
    expect(nomeIndicaFundo("Primária (fundo prioritário)")).toBe(true)
    expect(nomeIndicaFundo("PRIMARIA")).toBe(true)
    expect(nomeIndicaFundo("background")).toBe(true)
    expect(nomeIndicaFundo("Fundo")).toBe(true)
  })

  it("não casa com destaque, apoio, nulo ou vazio", () => {
    expect(nomeIndicaFundo("Laranja (energia/promo)")).toBe(false)
    expect(nomeIndicaFundo("Cinza de apoio")).toBe(false)
    expect(nomeIndicaFundo("Destaque")).toBe(false)
    expect(nomeIndicaFundo(null)).toBe(false)
    expect(nomeIndicaFundo("")).toBe(false)
  })

  it("não casa por substring solta — 'profundo' não é 'fundo'", () => {
    expect(nomeIndicaFundo("Azul profundo")).toBe(false)
  })
})
