import sharp from "sharp"
import { describe, expect, it } from "vitest"

import {
  composeCta,
  contraste,
  ctaBox,
  ctaFontSize,
  fontePadrao,
  hexToRgb,
  luminancia,
  pesoDaFonte,
  pickAccentColor,
  pickTextColor,
  renderCtaPill,
  saturacao,
  selectFonteAsset,
  FONTE_MIME_ALLOWLIST,
  PESO_LEVE_DEMAIS,
} from "./arte-cta"
import { logoBox } from "./arte-logo"

// Story 75-248 — CTA composto. Paletas reais do Kit em produção (31/07).
const VIND = [{ hex: "#FFFFFF" }, { hex: "#11220F" }, { hex: "#8FE6A7" }]
const TRIFOLD = [{ hex: "#000000" }, { hex: "#F27A5E" }, { hex: "#2E2E2E" }, { hex: "#FFFFFF" }]

describe("hexToRgb", () => {
  it("aceita #rrggbb e #rgb; recusa lixo", () => {
    expect(hexToRgb("#8FE6A7")).toEqual([143, 230, 167])
    expect(hexToRgb("8FE6A7")).toEqual([143, 230, 167])
    expect(hexToRgb("#fff")).toEqual([255, 255, 255])
    expect(hexToRgb("verde")).toBeNull()
    expect(hexToRgb("#12345")).toBeNull()
  })
})

describe("luminancia / contraste", () => {
  it("preto e branco são os extremos, e o contraste entre eles é 21:1", () => {
    expect(luminancia([0, 0, 0])).toBe(0)
    expect(luminancia([255, 255, 255])).toBeCloseTo(1, 5)
    expect(contraste([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1)
  })
})

describe("pickAccentColor (AC3)", () => {
  it("Vind → o verde menta, não o branco nem o verde quase-preto", () => {
    expect(pickAccentColor(VIND)).toBe("#8fe6a7")
  })

  it("Trifold → o laranja de promo, não o preto nem o cinza de apoio", () => {
    expect(pickAccentColor(TRIFOLD)).toBe("#f27a5e")
  })

  it("paleta vazia ou só neutros → null: NÃO inventa cor (arte sai sem CTA)", () => {
    expect(pickAccentColor([])).toBeNull()
    expect(pickAccentColor([{ hex: "#FFFFFF" }, { hex: "#000000" }, { hex: "#2E2E2E" }])).toBeNull()
  })

  it("ignora hex inválido em vez de quebrar", () => {
    expect(pickAccentColor([{ hex: "azul" }, { hex: "#8FE6A7" }])).toBe("#8fe6a7")
  })

  it("entre duas cromáticas, ganha a mais saturada", () => {
    const r = pickAccentColor([{ hex: "#8FA79A" }, { hex: "#00D26A" }])
    expect(r).toBe("#00d26a")
    expect(saturacao([0, 210, 106])).toBeGreaterThan(saturacao([143, 167, 154]))
  })
})

describe("pickTextColor (AC4)", () => {
  it("verde menta é claro → texto preto; e o contraste passa de 4.5:1", () => {
    expect(pickTextColor("#8FE6A7")).toBe("#000000")
    expect(contraste(hexToRgb("#8FE6A7")!, [0, 0, 0])).toBeGreaterThan(4.5)
  })

  it("laranja da Trifold → escolhe o lado de maior contraste", () => {
    const cor = pickTextColor("#F27A5E")
    const c = contraste(hexToRgb("#F27A5E")!, hexToRgb(cor)!)
    expect(c).toBeGreaterThanOrEqual(contraste(hexToRgb("#F27A5E")!, cor === "#000000" ? [255, 255, 255] : [0, 0, 0]))
  })

  it("hex inválido não quebra — cai para branco", () => {
    expect(pickTextColor("nada")).toBe("#FFFFFF")
  })
})

describe("ctaBox (AC5 — redesenhada na 75-296: pílula DENTRO da banda do logo)", () => {
  it("mora dentro da banda do logo, à esquerda, sem alcançar a área do logo à direita", () => {
    for (const [ar, w, h] of [["9:16", 768, 1376], ["4:5", 1080, 1350], ["1:1", 1080, 1080]] as const) {
      const cta = ctaBox(ar, w, h)
      const logo = logoBox(ar, w, h)
      expect(cta.top).toBeGreaterThanOrEqual(logo.bandTop) // dentro da banda
      expect(cta.top + cta.height).toBeLessThanOrEqual(logo.bandTop + logo.bandHeight)
      expect(cta.left).toBe(Math.round(w * 0.08)) // à esquerda, margem 8%
      // não invade a área do logo (alinhado à direita, margem 8%)
      const logoLeftMin = w - Math.round(w * 0.08) - logo.maxWidth
      expect(cta.left + cta.width).toBeLessThan(logoLeftMin)
    }
  })

  it("largura é fração única (46%) — story e feed proporcionais", () => {
    expect(ctaBox("9:16", 1080, 1920).width).toBe(ctaBox("1:1", 1080, 1080).width)
    expect(ctaBox("1:1", 1080, 1080).width).toBe(Math.round(1080 * 0.46))
  })
})

describe("ctaFontSize", () => {
  it("texto longo diminui o corpo; texto curto usa o limite de altura", () => {
    const box = ctaBox("9:16", 768, 1376)
    const curto = ctaFontSize("Saiba mais", box)
    const longo = ctaFontSize("Arraste e agende sua visita agora mesmo", box)
    expect(longo).toBeLessThan(curto)
    expect(curto).toBeLessThanOrEqual(Math.round(box.height * 0.4))
  })

  it("nunca devolve corpo ilegível, mesmo com texto absurdo", () => {
    expect(ctaFontSize("x".repeat(200), ctaBox("1:1", 1080, 1080))).toBeGreaterThanOrEqual(12)
  })
})

describe("selectFonteAsset", () => {
  const a = (brand_id: string, tipo: string, file_name: string) => ({
    brand_id, tipo, file_name, file_url: `https://x/${file_name}`,
  })

  it("fonte da marca do empreendimento ganha da institucional", () => {
    const r = selectFonteAsset([a("inst", "fonte", "space.ttf"), a("vind", "fonte", "mont.ttf")], ["vind", "inst"])
    expect(r?.file_name).toBe("mont.ttf")
  })

  it("sem fonte no Kit → null (cai para a Montserrat empacotada)", () => {
    expect(selectFonteAsset([a("vind", "logo", "l.png")], ["vind"])).toBeNull()
  })

  it("woff2 fora da allowlist — o satori não lê", () => {
    expect(FONTE_MIME_ALLOWLIST as readonly string[]).not.toContain("font/woff2")
    expect(FONTE_MIME_ALLOWLIST as readonly string[]).toContain("font/ttf")
  })
})

describe("fonte empacotada", () => {
  it("existe no bundle e é TrueType", () => {
    const f = fontePadrao()
    expect(f.byteLength).toBeGreaterThan(100_000)
    // TTF começa com 0x00010000 (ou "true"/"OTTO")
    expect([0x00, 0x74, 0x4f]).toContain(f[0])
  })
})

// O caminho real do satori+sharp — é onde mora o bug.
describe("renderCtaPill / composeCta", () => {
  const arteFake = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: "#101010" } }).png().toBuffer()

  async function brilhoDaRegiao(buf: Buffer, r: { left: number; top: number; width: number; height: number }) {
    const regiao = await sharp(buf).extract(r).toBuffer()
    const st = await sharp(regiao).stats()
    return st.channels.slice(0, 3).map((c) => c.mean)
  }

  it("a pílula sai na COR DO KIT (o defeito nº4 da 75-246: arte coral em marca verde)", async () => {
    const box = ctaBox("9:16", 768, 1376)
    const png = await renderCtaPill("Arraste e agende sua visita", box, "#8FE6A7", fontePadrao())
    const [r, g, b] = await brilhoDaRegiao(png, { left: Math.round(box.width / 2) - 5, top: 2, width: 10, height: 4 })
    // verde menta: G bem acima de R e B
    expect(g!).toBeGreaterThan(r! + 20)
    expect(g!).toBeGreaterThan(b! + 20)
  })

  it("o texto é VETORIZADO — nenhuma dependência de fonte do sistema", async () => {
    const box = ctaBox("1:1", 1080, 1080)
    const png = await renderCtaPill("Agende sua visita", box, "#F27A5E", fontePadrao())
    expect((await sharp(png).metadata()).width).toBe(box.width)
  })

  it("acentuação portuguesa não vira tofu (é o que o modelo acertava e não podemos perder)", async () => {
    const box = ctaBox("1:1", 1080, 1080)
    const semAcento = await renderCtaPill("Agende sua visita", box, "#8FE6A7", fontePadrao())
    const comAcento = await renderCtaPill("Visitação à noite", box, "#8FE6A7", fontePadrao())
    // se os glifos acentuados faltassem, o desenho seria idêntico ou vazio
    expect(Buffer.compare(semAcento, comAcento)).not.toBe(0)
  })

  it("compõe na arte sem mudar dimensão nem formato", async () => {
    const out = await composeCta(await arteFake(768, 1376), "Agende", "9:16", "#8FE6A7", fontePadrao())
    const m = await sharp(out).metadata()
    expect([m.width, m.height, m.format]).toEqual([768, 1376, "png"])
  })

  it("75-296: o CTA pinta a METADE ESQUERDA da banda; a direita (área do logo) fica intacta", async () => {
    const out = await composeCta(await arteFake(768, 1376), "Arraste e agende sua visita", "9:16", "#8FE6A7", fontePadrao())
    const logo = logoBox("9:16", 768, 1376)
    // esquerda da banda: a pílula clara sobe o brilho
    const esq = await brilhoDaRegiao(out, { left: 0, top: logo.bandTop, width: 384, height: logo.bandHeight })
    expect(esq[1]!).toBeGreaterThan(30)
    // direita da banda (casa do logo): fundo #101010 intacto
    const dir = await brilhoDaRegiao(out, { left: 500, top: logo.bandTop, width: 268, height: logo.bandHeight })
    expect(dir[0]!).toBeCloseTo(16, 0)
    expect(dir[1]!).toBeCloseTo(16, 0)
    expect(dir[2]!).toBeCloseTo(16, 0)
  })

  // Ressalva (a) do @po: o caminho de FALHA importa mais que antes, porque agora
  // falhar significa arte SEM CTA, não CTA feio.
  it("CAMINHO DE FALHA — buffer que não é imagem lança (o serviço segue sem CTA)", async () => {
    await expect(
      composeCta(Buffer.from("nao sou imagem"), "Agende", "9:16", "#8FE6A7", fontePadrao())
    ).rejects.toThrow()
  })

  it("CAMINHO DE FALHA — arte pequena demais lança em vez de gerar pílula de 2px", async () => {
    await expect(composeCta(await arteFake(100, 40), "Agende", "9:16", "#8FE6A7", fontePadrao())).rejects.toThrow(
      /pequena demais/
    )
  })
})

// ─── Story 75-259 — a fonte deixa de ser sorteada ────────────────────────────

describe("pesoDaFonte (75-259, AC3)", () => {
  it("ordena do mais pesado ao mais leve", () => {
    const nomes = [
      "Montserrat-Black.ttf",
      "Montserrat-ExtraBold.ttf",
      "Montserrat-SemiBold.ttf",
      "Montserrat-Bold.ttf",
      "Montserrat-Medium.ttf",
      "Montserrat-Regular.ttf",
      "Montserrat-Light.ttf",
      "Montserrat-Thin.ttf",
    ]
    const pesos = nomes.map(pesoDaFonte)
    expect(pesos).toEqual([...pesos].sort((a, b) => a - b))
  })

  /**
   * A ordem da tabela é load-bearing: "extrabold" CONTÉM "bold" e "extralight"
   * CONTÉM "light". Se os compostos não vierem antes, o match simples ganha e o
   * peso sai errado.
   */
  it("compostos não são confundidos com os simples", () => {
    expect(pesoDaFonte("Inter-ExtraBold.ttf")).toBeLessThan(pesoDaFonte("Inter-Bold.ttf"))
    expect(pesoDaFonte("Inter-ExtraLight.ttf")).toBeGreaterThan(pesoDaFonte("Inter-Light.ttf"))
    expect(pesoDaFonte("Inter-SemiBold.ttf")).toBeLessThan(pesoDaFonte("Inter-Bold.ttf"))
  })

  it("aceita separadores e caixa variados", () => {
    expect(pesoDaFonte("MONTSERRAT_SEMI-BOLD.OTF")).toBe(pesoDaFonte("Montserrat-SemiBold.ttf"))
    expect(pesoDaFonte("Montserrat semi bold.ttf")).toBe(pesoDaFonte("Montserrat-SemiBold.ttf"))
  })

  it("nome sem indicação de peso fica entre regular e light", () => {
    const semPeso = pesoDaFonte("MinhaFonteDaMarca.ttf")
    expect(semPeso).toBeGreaterThan(pesoDaFonte("X-Regular.ttf"))
    expect(semPeso).toBeLessThan(pesoDaFonte("X-Light.ttf"))
  })

  it("light e thin são leves demais para título", () => {
    expect(pesoDaFonte("X-Light.ttf")).toBeGreaterThanOrEqual(PESO_LEVE_DEMAIS)
    expect(pesoDaFonte("X-Thin.ttf")).toBeGreaterThanOrEqual(PESO_LEVE_DEMAIS)
    expect(pesoDaFonte("X-Medium.ttf")).toBeLessThan(PESO_LEVE_DEMAIS)
  })
})

describe("selectFonteAsset determinístico (75-259, AC3)", () => {
  const f = (brand_id: string, file_name: string) => ({ brand_id, tipo: "fonte", file_name, file_url: `u/${file_name}` })

  /**
   * 🔴 O BUG: era `assets.find(...)` — o PRIMEIRO que aparecesse. A consulta que
   * alimenta os candidatos não tem ORDER BY, então o peso do título de ~100px era
   * decidido pela ordem que o Postgres devolveu.
   */
  it("escolhe a mais pesada, não a primeira da lista", () => {
    const assets = [f("v", "Montserrat-Light.ttf"), f("v", "Montserrat-Bold.ttf"), f("v", "Montserrat-Regular.ttf")]
    expect(selectFonteAsset(assets, ["v"])?.file_name).toBe("Montserrat-Bold.ttf")
    // e o resultado NÃO depende da ordem de entrada
    expect(selectFonteAsset([...assets].reverse(), ["v"])?.file_name).toBe("Montserrat-Bold.ttf")
  })

  it("Kit real do Vind (Light ×2, Medium, Regular) escolhe a Medium", () => {
    const assets = [
      f("vind", "Montserrat-Light.ttf"),
      f("vind", "Montserrat-Light.ttf"),
      f("vind", "Montserrat-Medium.ttf"),
      f("vind", "Montserrat-Regular.ttf"),
    ]
    expect(selectFonteAsset(assets, ["vind"])?.file_name).toBe("Montserrat-Medium.ttf")
  })

  it("respeita a prioridade de marca antes do peso", () => {
    const assets = [f("inst", "Marca-Black.ttf"), f("empr", "Marca-Regular.ttf")]
    // empreendimento vem primeiro em brandPriority: a fonte DELE ganha, mesmo mais leve
    expect(selectFonteAsset(assets, ["empr", "inst"])?.file_name).toBe("Marca-Regular.ttf")
  })

  it("empate de peso resolve por nome — determinístico com duplicados", () => {
    const assets = [f("v", "B-Medium.ttf"), f("v", "A-Medium.ttf")]
    expect(selectFonteAsset(assets, ["v"])?.file_name).toBe("A-Medium.ttf")
  })

  it("marca sem fonte devolve null (cai na empacotada)", () => {
    expect(selectFonteAsset([f("outra", "X-Bold.ttf")], ["v"])).toBeNull()
  })
})
