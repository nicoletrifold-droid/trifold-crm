import { describe, expect, it } from "vitest"

import {
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
    expect(r.value.fontes).toEqual([{ papel: "Título", nome: "Montserrat" }])
    expect(r.value.voz_da_marca).toBeNull()
    expect(r.value.diretrizes).toBeNull()
  })

  it("cores aceita formato v1 (strings) e converte", () => {
    const r = validateMarketingBrandInput({ ...base, cores: ["#e8856a"] }, { partial: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cores).toEqual([{ hex: "#E8856A", nome: null }])
  })

  it("fonte com papel mas sem nome falha; papel vazio vira Geral", () => {
    const bad = validateMarketingBrandInput({ ...base, fontes: [{ papel: "Título", nome: "" }] }, { partial: false })
    expect(bad.ok).toBe(false)
    const ok = validateMarketingBrandInput({ ...base, fontes: [{ papel: "", nome: "Inter" }] }, { partial: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.fontes).toEqual([{ papel: "Geral", nome: "Inter" }])
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
  it("whitelist logo/foto/elemento", () => {
    expect(isValidBrandAssetTipo("logo")).toBe(true)
    expect(isValidBrandAssetTipo("foto")).toBe(true)
    expect(isValidBrandAssetTipo("elemento")).toBe(true)
    expect(isValidBrandAssetTipo("video")).toBe(false)
  })
})
