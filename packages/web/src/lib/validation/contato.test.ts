import { describe, it, expect } from "vitest"
import { normalizeCpfCnpj, cpfLookupValues, maskCpfCnpj } from "./contato"

// Story 75-282 — o par gravar/buscar é o que impede o sync Sienge de duplicar cliente.

describe("normalizeCpfCnpj — o que vai para o banco", () => {
  it("tira a máscara", () => {
    expect(normalizeCpfCnpj("207.363.470-20")).toBe("20736347020")
    expect(normalizeCpfCnpj("865.001.559-04")).toBe("86500155904")
  })

  it("é idempotente com valor já limpo", () => {
    expect(normalizeCpfCnpj("20736347020")).toBe("20736347020")
  })

  it("vira null quando não sobra dígito (entrada vazia ou só pontuação)", () => {
    expect(normalizeCpfCnpj("")).toBeNull()
    expect(normalizeCpfCnpj("...--")).toBeNull()
    expect(normalizeCpfCnpj(null)).toBeNull()
    expect(normalizeCpfCnpj(undefined)).toBeNull()
  })

  it("preserva CNPJ (14 dígitos) — a coluna guarda os dois", () => {
    expect(normalizeCpfCnpj("12.345.678/0001-95")).toBe("12345678000195")
  })
})

describe("cpfLookupValues — o que se compara ao buscar", () => {
  it("cobre os dois formatos, venha mascarado ou limpo", () => {
    expect(cpfLookupValues("207.363.470-20")).toEqual([
      "20736347020",
      "207.363.470-20",
    ])
    expect(cpfLookupValues("20736347020")).toEqual([
      "20736347020",
      "207.363.470-20",
    ])
  })

  it("não repete valor quando os dois formatos coincidem", () => {
    // CNPJ mascarado por maskCpfCnpj tem forma própria; o que importa é não duplicar entrada
    const vals = cpfLookupValues("12345678000195")
    expect(new Set(vals).size).toBe(vals.length)
  })

  it("devolve lista vazia para entrada sem dígito — chamador trata como 'sem filtro'", () => {
    expect(cpfLookupValues("")).toEqual([])
    expect(cpfLookupValues(null)).toEqual([])
  })

  it("o formato mascarado da lista é o mesmo que a UI exibe", () => {
    const [, masked] = cpfLookupValues("20736347020")
    expect(masked).toBe(maskCpfCnpj("20736347020"))
  })
})
