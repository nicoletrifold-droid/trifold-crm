import { describe, it, expect } from "vitest"
import { normalizeSearchTerm, orSafeSearchTerm } from "./search"

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
