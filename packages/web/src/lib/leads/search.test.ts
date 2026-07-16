import { describe, it, expect } from "vitest"
import { normalizeSearchTerm, orSafeSearchTerm, leadMatchesSearch, trigramSimilarity } from "./search"

describe("normalizeSearchTerm (Story 75-167)", () => {
  it("tira acento e baixa a caixa (andreia = Andréia)", () => {
    expect(normalizeSearchTerm("Andréia")).toBe("andreia")
    expect(normalizeSearchTerm("ANDRÉIA")).toBe("andreia")
    expect(normalizeSearchTerm("andreia")).toBe("andreia")
  })
  it("cobre ç e outros diacríticos", () => {
    expect(normalizeSearchTerm("Conceição")).toBe("conceicao")
    expect(normalizeSearchTerm("João")).toBe("joao")
  })
  it("trim + null-safe", () => {
    expect(normalizeSearchTerm("  Maria  ")).toBe("maria")
    expect(normalizeSearchTerm(null)).toBe("")
    expect(normalizeSearchTerm(undefined)).toBe("")
  })
})

describe("orSafeSearchTerm (Story 75-167)", () => {
  it("remove caracteres que quebram o filtro PostgREST .or (vírgula/parênteses/curingas)", () => {
    expect(orSafeSearchTerm("a,b(c)%*")).toBe("a b c")
    expect(orSafeSearchTerm("José, Maria")).toBe("jose maria")
  })
})

describe("leadMatchesSearch (Story 75-168 — client-side)", () => {
  it("acento: 'andreia' casa 'Andréia'", () => {
    expect(leadMatchesSearch(["Andréia", "5544999"], "andreia")).toBe(true)
  })
  it("fuzzy: typo 'robsom' casa 'Robson' (termo ≥4)", () => {
    expect(leadMatchesSearch(["Robson"], "robsom")).toBe(true)
  })
  it("telefone por dígitos", () => {
    expect(leadMatchesSearch(["Maria", "+55 44 98844-7212"], "988447212")).toBe(true)
  })
  it("termo vazio → casa (sem filtro)", () => {
    expect(leadMatchesSearch(["Qualquer"], "")).toBe(true)
  })
  it("não casa nome totalmente diferente", () => {
    expect(leadMatchesSearch(["Fernando"], "carlos")).toBe(false)
  })
})

describe("trigramSimilarity", () => {
  it("iguais = 1; parecidos > 0.3; diferentes baixos", () => {
    expect(trigramSimilarity("robson", "robson")).toBe(1)
    expect(trigramSimilarity("robson", "robsom")).toBeGreaterThan(0.3)
    expect(trigramSimilarity("ana", "fernando")).toBeLessThan(0.2)
  })
})
