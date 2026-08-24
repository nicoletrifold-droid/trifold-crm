/**
 * Story 900-22 — o slug é o que torna `provision_org` idempotente, então errá-lo significa
 * criar empresa duplicada em vez de retomar a existente.
 */
import { describe, it, expect } from "vitest"
import { slugify } from "./route"

describe("slugify", () => {
  it("normaliza nome comum", () => {
    expect(slugify("Acme Imóveis")).toBe("acme-imoveis")
  })

  it("remove acentos", () => {
    expect(slugify("Construções São João")).toBe("construcoes-sao-joao")
  })

  it("colapsa pontuação e espaços múltiplos", () => {
    expect(slugify("A & B   Imóveis, Ltda.")).toBe("a-b-imoveis-ltda")
  })

  it("não deixa hífen nas pontas", () => {
    expect(slugify("  -Acme-  ")).toBe("acme")
  })

  it("nome só com símbolos vira vazio (a rota rejeita)", () => {
    expect(slugify("!!!")).toBe("")
  })

  it("é estável — mesmo nome, mesmo slug (base da idempotência)", () => {
    expect(slugify("Acme Imóveis")).toBe(slugify("acme   imoveis"))
  })
})
