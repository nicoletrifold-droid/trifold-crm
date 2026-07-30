import { describe, expect, it } from "vitest"

import {
  BRAND_ASSET_EXTENSIONS,
  MARKETING_BRAND_ASSET_TIPOS,
  fonteAssetIds,
  isAllowedBrandAssetFile,
  mimeForBrandAssetFile,
  isValidBrandAssetTipo,
  validateBrandConsistency,
  validateMarketingBrandInput,
} from "./brands"

// Story 75-229 — Kit de Marcas: validação pura (padrão posts.test.ts)
describe("validateMarketingBrandInput", () => {
  const base = { nome: "Vind Residence", tipo: "empreendimento", property_id: "11111111-2222-3333-4444-555555555555" }

  it("POST válido normaliza cores {hex,nome} e fontes {papel,nome}", () => {
    const r = validateMarketingBrandInput(
      {
        ...base,
        cores: [{ hex: "#e8856a", nome: " Primária " }, { hex: " #FFF ", nome: "" }, { hex: "" }],
        fontes: [{ papel: " Título ", nome: " Montserrat " }, { papel: "", nome: "" }],
        voz_da_marca: "",
        diretrizes: null,
      },
      { partial: false }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.cores).toEqual([
      { hex: "#E8856A", nome: "Primária" },
      { hex: "#FFF", nome: null },
    ])
    expect(r.value.fontes).toEqual([{ papel: "Título", nome: "Montserrat", asset_id: null }])
    expect(r.value.voz_da_marca).toBeNull()
    expect(r.value.diretrizes).toBeNull()
  })

  it("cores aceita formato v1 (strings) e converte", () => {
    const r = validateMarketingBrandInput({ ...base, cores: ["#e8856a"] }, { partial: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cores).toEqual([{ hex: "#E8856A", nome: null }])
  })

  it("fonte com papel mas sem nome nem arquivo falha; papel vazio vira Geral", () => {
    const bad = validateMarketingBrandInput({ ...base, fontes: [{ papel: "Título", nome: "" }] }, { partial: false })
    expect(bad.ok).toBe(false)
    const ok = validateMarketingBrandInput({ ...base, fontes: [{ papel: "", nome: "Inter" }] }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.fontes).toEqual([{ papel: "Geral", nome: "Inter", asset_id: null }])
  })

  // Story 75-234 — upload do arquivo da fonte
  it("fonte SÓ com arquivo vale (nome deixa de ser obrigatório)", () => {
    const assetId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const r = validateMarketingBrandInput(
      { ...base, fontes: [{ papel: "Título", nome: "", asset_id: assetId }] },
      { partial: false }
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.fontes).toEqual([{ papel: "Título", nome: "", asset_id: assetId }])
  })

  it("asset_id não-uuid falha; linha 100% vazia é descartada", () => {
    const bad = validateMarketingBrandInput({ ...base, fontes: [{ papel: "T", nome: "Inter", asset_id: "x" }] }, { partial: false })
    expect(bad.ok).toBe(false)
    const ok = validateMarketingBrandInput({ ...base, fontes: [{ papel: "", nome: "", asset_id: null }] }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.fontes).toEqual([])
  })

  it("POST sem nome falha", () => {
    const r = validateMarketingBrandInput({ ...base, nome: "  " }, { partial: false })
    expect(r.ok).toBe(false)
  })

  it("tipo fora da whitelist falha", () => {
    const r = validateMarketingBrandInput({ ...base, tipo: "produto" }, { partial: false })
    expect(r.ok).toBe(false)
  })

  it("cor não-hex falha", () => {
    const r = validateMarketingBrandInput({ ...base, cores: [{ hex: "laranja", nome: null }] }, { partial: false })
    expect(r.ok).toBe(false)
  })

  it("PATCH parcial só devolve campos presentes", () => {
    const r = validateMarketingBrandInput({ cores: [{ hex: "#000", nome: "Fundo" }] }, { partial: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({ cores: [{ hex: "#000", nome: "Fundo" }] })
  })

  it("property_id vazio vira null; inválido falha", () => {
    const ok = validateMarketingBrandInput({ ...base, tipo: "institucional", property_id: "" }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.property_id).toBeNull()
    const bad = validateMarketingBrandInput({ ...base, property_id: "abc" }, { partial: false })
    expect(bad.ok).toBe(false)
  })
})

describe("validateBrandConsistency", () => {
  it("empreendimento exige property; institucional proíbe", () => {
    expect(validateBrandConsistency("empreendimento", null)).toBeTruthy()
    expect(validateBrandConsistency("empreendimento", "id")).toBeNull()
    expect(validateBrandConsistency("institucional", "id")).toBeTruthy()
    expect(validateBrandConsistency("institucional", null)).toBeNull()
  })
})

describe("isValidBrandAssetTipo", () => {
  it("whitelist logo/foto/elemento/fonte", () => {
    expect(isValidBrandAssetTipo("logo")).toBe(true)
    expect(isValidBrandAssetTipo("foto")).toBe(true)
    expect(isValidBrandAssetTipo("elemento")).toBe(true)
    expect(isValidBrandAssetTipo("fonte")).toBe(true)
    expect(isValidBrandAssetTipo("video")).toBe(false)
  })
})

// Story 75-234 — a extensão é a barreira real (o mime vai canônico ao bucket)
describe("isAllowedBrandAssetFile", () => {
  it("imagem não aceita fonte e fonte não aceita imagem", () => {
    expect(isAllowedBrandAssetFile("logo", "marca.png")).toBe(true)
    expect(isAllowedBrandAssetFile("logo", "Montserrat.ttf")).toBe(false)
    expect(isAllowedBrandAssetFile("fonte", "Montserrat-SemiBold.TTF")).toBe(true)
    expect(isAllowedBrandAssetFile("fonte", "Inter.woff2")).toBe(true)
    expect(isAllowedBrandAssetFile("fonte", "arte.png")).toBe(false)
    expect(isAllowedBrandAssetFile("fonte", "fonte")).toBe(false)
  })

  it("jfif/jpe seguem aceitos como imagem (QA 75-234)", () => {
    expect(isAllowedBrandAssetFile("foto", "fachada.jfif")).toBe(true)
    expect(isAllowedBrandAssetFile("foto", "fachada.jpe")).toBe(true)
  })
})

describe("mimeForBrandAssetFile", () => {
  it("mime vem da extensão, não do navegador", () => {
    expect(mimeForBrandAssetFile("Montserrat.ttf")).toBe("font/ttf")
    expect(mimeForBrandAssetFile("Inter.WOFF2")).toBe("font/woff2")
    expect(mimeForBrandAssetFile("fachada.jfif")).toBe("image/jpeg")
    expect(mimeForBrandAssetFile("marca.svg")).toBe("image/svg+xml")
    expect(mimeForBrandAssetFile("planilha.xlsx")).toBeNull()
  })

  it("todo formato aceito tem mime canônico (nada cai em octet-stream)", () => {
    for (const tipo of MARKETING_BRAND_ASSET_TIPOS) {
      for (const ext of BRAND_ASSET_EXTENSIONS[tipo]) {
        expect(mimeForBrandAssetFile(`arquivo.${ext}`)).toBeTruthy()
      }
    }
  })
})

describe("fonteAssetIds", () => {
  it("dedup e ignora nulos", () => {
    expect(
      fonteAssetIds([
        { papel: "T", nome: "A", asset_id: "id-1" },
        { papel: "C", nome: "B", asset_id: "id-1" },
        { papel: "L", nome: "C", asset_id: null },
        { papel: "X", nome: "D" },
      ])
    ).toEqual(["id-1"])
  })
})
