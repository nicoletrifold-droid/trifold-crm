// Story 75-294 — núcleo puro do pedido de tráfego pago.
import { describe, it, expect } from "vitest"
import {
  composeDirecao,
  chipsValidos,
  enforceAdLimit,
  ratiosDoPedido,
  AD_PRIMARY_MAX,
  AD_HEADLINE_MAX,
} from "./direcao"

describe("composeDirecao", () => {
  it("chips na ordem dos grupos + detalhes livres no fim", () => {
    const out = composeDirecao(
      { pessoas: "sem", cenario: "por_do_sol" },
      "destacar a piscina da cobertura"
    )
    expect(out).toBe(
      "pôr do sol atrás do prédio, céu quente; sem pessoas na cena; destacar a piscina da cobertura"
    )
  })

  it("chip desconhecido é ignorado (não injeta texto arbitrário)", () => {
    expect(composeDirecao({ cenario: "DROP TABLE", hack: "x" }, "")).toBe("")
  })

  it("sem chips e sem detalhes = string vazia (fluxo atual intocado)", () => {
    expect(composeDirecao(null, null)).toBe("")
    expect(composeDirecao({}, "  ")).toBe("")
  })

  it("só detalhes livres = comporta como o campo antigo", () => {
    expect(composeDirecao(null, "luz de manhã, tons quentes")).toBe("luz de manhã, tons quentes")
  })
})

describe("chipsValidos", () => {
  it("aceita ausente, null e objeto raso de strings", () => {
    expect(chipsValidos(undefined)).toBe(true)
    expect(chipsValidos(null)).toBe(true)
    expect(chipsValidos({ cenario: "por_do_sol" })).toBe(true)
  })
  it("rejeita array e valores não-string", () => {
    expect(chipsValidos(["x"])).toBe(false)
    expect(chipsValidos({ cenario: 1 })).toBe(false)
  })
})

describe("ratiosDoPedido", () => {
  it("orgânico = null (o formato manda, como hoje)", () => {
    expect(ratiosDoPedido("organico", ["1:1"])).toBeNull()
  })
  it("pago sem escolha = as 3", () => {
    expect(ratiosDoPedido("pago", null)).toEqual(["1:1", "4:5", "9:16"])
    expect(ratiosDoPedido("pago", [])).toEqual(["1:1", "4:5", "9:16"])
  })
  it("pago com escolha = só as válidas, sem duplicata", () => {
    expect(ratiosDoPedido("pago", ["9:16", "9:16", "16:9"])).toEqual(["9:16"])
  })
  it("pago só com inválidas = cai para as 3 (não gera zero arte)", () => {
    expect(ratiosDoPedido("pago", ["16:9"])).toEqual(["1:1", "4:5", "9:16"])
  })
})

describe("enforceAdLimit", () => {
  it("dentro do limite passa intacto; vazio/null vira null", () => {
    expect(enforceAdLimit("Agende sua visita", AD_HEADLINE_MAX)).toBe("Agende sua visita")
    expect(enforceAdLimit("  ", AD_HEADLINE_MAX)).toBeNull()
    expect(enforceAdLimit(null, AD_HEADLINE_MAX)).toBeNull()
  })

  it("acima do limite corta na fronteira de palavra com reticência", () => {
    const long = "Unidades exclusivas com lazer completo liberado para Airbnb em Maringá"
    const out = enforceAdLimit(long, AD_HEADLINE_MAX)!
    expect(out.length).toBeLessThanOrEqual(AD_HEADLINE_MAX)
    expect(out.endsWith("…")).toBe(true)
    expect(out).toBe("Unidades exclusivas com…")
  })

  it("primary text respeita 125", () => {
    const out = enforceAdLimit("a".repeat(60) + " " + "b".repeat(200), AD_PRIMARY_MAX)!
    expect(out.length).toBeLessThanOrEqual(AD_PRIMARY_MAX)
    expect(out.endsWith("…")).toBe(true)
  })
})
