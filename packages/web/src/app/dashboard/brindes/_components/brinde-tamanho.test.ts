import { describe, expect, it } from "vitest"

import { buildResumoBrindes, buildTamanhoOptions, formatResumoBrindes } from "./brinde-tamanho"

// Story 75-372 — números reais de produção medidos em 04/09/2026: 200 destinatários,
// 36 com `brinde_tipo_id`, 164 sem. Catálogo com 5 tamanhos distintos: P, M, G, GG, EXGG.

describe("buildTamanhoOptions", () => {
  it("🔴 AC3 — ordem é P, M, G, GG, EXGG, nunca alfabética", () => {
    // Catálogo embaralhado como vem do banco (ordenado por nome, não por tamanho).
    const tipos = [
      { tamanho: "GG" },
      { tamanho: "P" },
      { tamanho: "EXGG" },
      { tamanho: "M" },
      { tamanho: "G" },
    ]
    expect(buildTamanhoOptions(tipos)).toEqual(["P", "M", "G", "GG", "EXGG"])
    // A prova de que não é alfabético: alfabético daria EXGG primeiro.
    expect(buildTamanhoOptions(tipos)[0]).not.toBe("EXGG")
  })

  it("só os tamanhos que existem no catálogo entram, sem duplicar", () => {
    // Camiseta P/M/G/GG/EXGG + Baby look P/M/G/GG = 9 linhas, 5 tamanhos distintos.
    const tipos = ["P", "M", "G", "GG", "EXGG", "P", "M", "G", "GG"].map((tamanho) => ({ tamanho }))
    expect(buildTamanhoOptions(tipos)).toEqual(["P", "M", "G", "GG", "EXGG"])
  })

  it("tamanho nulo ou em branco não vira opção", () => {
    const tipos = [{ tamanho: null }, { tamanho: "" }, { tamanho: "   " }, { tamanho: "M" }]
    expect(buildTamanhoOptions(tipos)).toEqual(["M"])
  })

  it("valor fora da sequência conhecida vai depois, em ordem alfabética", () => {
    // `tamanho` é texto livre no catálogo (mig 036) — nada impede "Único" ou "38".
    const tipos = [{ tamanho: "Único" }, { tamanho: "G" }, { tamanho: "38" }, { tamanho: "P" }]
    expect(buildTamanhoOptions(tipos)).toEqual(["P", "G", "38", "Único"])
  })
})

describe("buildResumoBrindes", () => {
  const camiseta = (tamanho: string | null) => ({ brindes_tipos: { nome: "Camiseta", tamanho } })
  const babylook = (tamanho: string | null) => ({ brindes_tipos: { nome: "Baby look", tamanho } })
  const semBrinde = () => ({ brindes_tipos: null })

  it("🔴 AC5 — a soma das entradas é exatamente records.length (cenário de produção)", () => {
    const records = [
      ...Array.from({ length: 11 }, () => camiseta("G")),
      ...Array.from({ length: 3 }, () => camiseta("M")),
      ...Array.from({ length: 7 }, () => babylook("M")),
      ...Array.from({ length: 15 }, () => semBrinde()),
    ]
    const soma = buildResumoBrindes(records).reduce((acc, e) => acc + e.count, 0)
    expect(soma).toBe(records.length)
    expect(soma).toBe(36)
  })

  it("🔴 AC5 — 'Sem brinde definido' é sempre a última entrada", () => {
    const records = [semBrinde(), camiseta("M"), semBrinde(), babylook("G")]
    const entries = buildResumoBrindes(records)
    expect(entries[entries.length - 1]).toEqual({ label: "Sem brinde definido", count: 2 })
  })

  it("registro com FK preenchida mas embed nulo continua contado (invariante não vaza)", () => {
    // Cenário defensivo: `brinde_tipo_id` existe mas o embed veio nulo. Se este caso
    // caísse fora dos dois buckets, a soma do resumo passaria a mentir sobre o total.
    const records = [{ brindes_tipos: null }, camiseta("P")]
    const soma = buildResumoBrindes(records).reduce((acc, e) => acc + e.count, 0)
    expect(soma).toBe(2)
  })

  it("tamanho nulo no catálogo: entrada fica só com o nome do item", () => {
    expect(buildResumoBrindes([camiseta(null), camiseta(null)])).toEqual([
      { label: "Camiseta", count: 2 },
    ])
  })

  it("lista vazia não gera entrada nenhuma", () => {
    expect(buildResumoBrindes([])).toEqual([])
    expect(formatResumoBrindes([])).toBe("")
  })

  it("formata em linha corrida separada por ' | ', com o bucket sem brinde no fim", () => {
    const records = [
      camiseta("G"),
      camiseta("G"),
      camiseta("M"),
      babylook("M"),
      semBrinde(),
      semBrinde(),
      semBrinde(),
    ]
    expect(formatResumoBrindes(records)).toBe(
      "Baby look M: 1 | Camiseta G: 2 | Camiseta M: 1 | Sem brinde definido: 3",
    )
  })
})
