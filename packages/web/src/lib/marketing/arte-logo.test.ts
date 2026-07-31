import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { composeLogo, logoBox, logoPosition, selectLogoAsset, LOGO_MIME_ALLOWLIST } from "./arte-logo"

// Story 75-246 — layout do logo composto: PURO, sem sharp e sem rede (AC5).
describe("logoBox", () => {
  it("story 9:16 (1080×1920): faixa de 14% no rodapé, logo até 26% da largura", () => {
    const b = logoBox("9:16", 1080, 1920)
    expect(b.bandHeight).toBe(269) // 1920 * 0.14
    expect(b.bandTop).toBe(1920 - 269)
    expect(b.maxWidth).toBe(281) // 1080 * 0.26
    expect(b.maxHeight).toBe(161) // 269 * 0.6
  })

  it("feed 4:5 e 1:1 usam faixa de 12% e logo menor que o do story", () => {
    const quatroCinco = logoBox("4:5", 1080, 1350)
    const umUm = logoBox("1:1", 1080, 1080)
    expect(quatroCinco.bandHeight).toBe(162)
    expect(umUm.bandHeight).toBe(130)
    expect(quatroCinco.maxWidth).toBeLessThan(logoBox("9:16", 1080, 1920).maxWidth)
    expect(umUm.maxWidth).toBe(216)
  })

  it("a faixa nunca passa do rodapé, em qualquer formato", () => {
    for (const [ar, w, h] of [["9:16", 1080, 1920], ["4:5", 1080, 1350], ["1:1", 1080, 1080]] as const) {
      const b = logoBox(ar, w, h)
      expect(b.bandTop + b.bandHeight).toBe(h)
      expect(b.maxHeight).toBeLessThan(b.bandHeight) // sempre sobra respiro
    }
  })
})

describe("logoPosition", () => {
  it("centraliza na horizontal e no meio da faixa", () => {
    const box = logoBox("9:16", 1080, 1920)
    const { left, top } = logoPosition(box, 280, 100, 1080)
    expect(left).toBe(400) // (1080 - 280) / 2
    expect(top).toBe(box.bandTop + Math.round((box.bandHeight - 100) / 2))
  })

  it("logo maior que a arte não gera coordenada negativa (sharp recusaria)", () => {
    const box = logoBox("1:1", 1080, 1080)
    const { left, top } = logoPosition(box, 2000, 900, 1080)
    expect(left).toBe(0)
    expect(top).toBeGreaterThanOrEqual(0)
  })
})

// AC3 — mesma semântica de selectArteReferencias: empreendimento antes do institucional.
describe("selectLogoAsset", () => {
  const a = (brand_id: string, tipo: string, file_name: string) => ({
    brand_id, tipo, file_name, file_url: `https://x/${file_name}`,
  })
  const VIND = "b-vind"
  const INST = "b-inst"

  it("logo do empreendimento ganha do institucional", () => {
    const r = selectLogoAsset([a(INST, "logo", "trifold.png"), a(VIND, "logo", "vind.svg")], [VIND, INST])
    expect(r?.file_name).toBe("vind.svg")
  })

  it("sem logo do empreendimento, cai para o institucional", () => {
    const r = selectLogoAsset([a(INST, "logo", "trifold.png"), a(VIND, "foto", "fachada.jpg")], [VIND, INST])
    expect(r?.file_name).toBe("trifold.png")
  })

  it("nenhum logo em marca alguma → ícone, também por prioridade", () => {
    const r = selectLogoAsset([a(INST, "icone", "pomba.png"), a(VIND, "icone", "v.png")], [VIND, INST])
    expect(r?.file_name).toBe("v.png")
  })

  it("logo SEMPRE ganha de ícone, mesmo o ícone sendo da marca prioritária", () => {
    const r = selectLogoAsset([a(VIND, "icone", "v.png"), a(INST, "logo", "trifold.png")], [VIND, INST])
    expect(r?.file_name).toBe("trifold.png")
  })

  it("sem logo nem ícone → null (arte sai sem logo, fail-open do AC4)", () => {
    expect(selectLogoAsset([a(VIND, "foto", "f.jpg"), a(VIND, "fonte", "M.ttf")], [VIND])).toBeNull()
  })
})

// O caminho do sharp é onde mora o bug de verdade — as funções puras acima não
// o cobrem. GOTCHA que custou um falso negativo: `stats()` lê a imagem de
// ORIGEM e ignora ops pendentes; a região tem que virar buffer antes de medir.
describe("composeLogo (caminho real do sharp)", () => {
  const arteFake = (w: number, h: number, fmt: "png" | "jpeg") =>
    sharp({ create: { width: w, height: h, channels: 3, background: "#101010" } })[fmt]().toBuffer()
  const logoPng = () =>
    sharp({ create: { width: 600, height: 200, channels: 4, background: "#ffffffff" } }).png().toBuffer()
  const logoSvg = () =>
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#fff"/></svg>')

  async function brilhoDaRegiao(buf: Buffer, r: { left: number; top: number; width: number; height: number }) {
    const regiao = await sharp(buf).extract(r).toBuffer()
    return (await sharp(regiao).stats()).channels[0]!.mean
  }

  it("aplica o logo NA faixa e não encosta no resto da arte", async () => {
    const arte = await arteFake(1080, 1920, "png")
    const out = await composeLogo(arte, await logoPng(), "image/png", "9:16")
    const box = logoBox("9:16", 1080, 1920)

    const faixa = await brilhoDaRegiao(out, { left: 0, top: box.bandTop, width: 1080, height: box.bandHeight })
    const topo = await brilhoDaRegiao(out, { left: 0, top: 0, width: 1080, height: 400 })

    expect(faixa).toBeGreaterThan(16) // fundo era #101010
    expect(topo).toBeCloseTo(16, 0) // topo intacto
  })

  it("SVG rasteriza igual ao PNG (o ganho da story)", async () => {
    const arte = await arteFake(1080, 1920, "png")
    const box = logoBox("9:16", 1080, 1920)
    const regiao = { left: 0, top: box.bandTop, width: 1080, height: box.bandHeight }

    const viaPng = await brilhoDaRegiao(await composeLogo(arte, await logoPng(), "image/png", "9:16"), regiao)
    const viaSvg = await brilhoDaRegiao(await composeLogo(arte, logoSvg(), "image/svg+xml", "9:16"), regiao)
    expect(viaSvg).toBeCloseTo(viaPng, 0)
  })

  it("preserva o formato de entrada — arte JPEG não pode sair PNG", async () => {
    const out = await composeLogo(await arteFake(1080, 1080, "jpeg"), await logoPng(), "image/png", "1:1")
    expect((await sharp(out).metadata()).format).toBe("jpeg")
  })

  it("dimensões da arte não mudam", async () => {
    const out = await composeLogo(await arteFake(1080, 1350, "png"), await logoPng(), "image/png", "4:5")
    const m = await sharp(out).metadata()
    expect([m.width, m.height]).toEqual([1080, 1350])
  })

  it("buffer que não é imagem → lança (o serviço trata como arte sem logo, AC4)", async () => {
    await expect(composeLogo(Buffer.from("nao sou imagem"), await logoPng(), "image/png", "1:1")).rejects.toThrow()
  })
})

describe("LOGO_MIME_ALLOWLIST", () => {
  it("aceita SVG — que a allowlist do Vertex recusa (ganho da story)", () => {
    expect(LOGO_MIME_ALLOWLIST).toContain("image/svg+xml")
    expect(LOGO_MIME_ALLOWLIST).toContain("image/png")
  })
})
