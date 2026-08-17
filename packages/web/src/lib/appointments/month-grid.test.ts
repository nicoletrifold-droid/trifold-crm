import { describe, it, expect } from "vitest"
import { gradeDoMes, mesesDisponiveis, mesDaData, rotuloDoDia, nomeDoMes } from "./month-grid"

// Story 75-335 — a grade mensal. Erro de calendário é do tipo que só aparece
// no dia 31, então os casos de borda são o teste.

describe("gradeDoMes", () => {
  it("agosto/2026 começa no sábado — 5 células vazias antes do dia 1", () => {
    // 2026-08-01 é sábado. Grade começa na segunda ⇒ Seg..Sex vazios (5).
    const g = gradeDoMes({ mes: "2026-08", disponiveis: [] })
    expect(g[0]!.slice(0, 5).every((c) => c.date === null)).toBe(true)
    expect(g[0]![5]!.dia).toBe(1)
  })

  it("todas as semanas têm exatamente 7 células", () => {
    for (const mes of ["2026-01", "2026-02", "2026-08", "2026-11", "2026-12"]) {
      const g = gradeDoMes({ mes, disponiveis: [] })
      expect(g.every((s) => s.length === 7)).toBe(true)
    }
  })

  it("cobre todos os dias do mês, inclusive fevereiro bissexto", () => {
    const dias = (mes: string) =>
      gradeDoMes({ mes, disponiveis: [] })
        .flat()
        .filter((c) => c.dia !== null).length
    expect(dias("2026-02")).toBe(28)
    expect(dias("2028-02")).toBe(29) // bissexto
    expect(dias("2026-01")).toBe(31)
    expect(dias("2026-04")).toBe(30)
  })

  it("marca disponível só o que veio na lista", () => {
    const g = gradeDoMes({ mes: "2026-08", disponiveis: ["2026-08-18", "2026-08-20"] })
    const disp = g.flat().filter((c) => c.disponivel).map((c) => c.date)
    expect(disp).toEqual(["2026-08-18", "2026-08-20"])
  })

  it("data de outro mês na lista não contamina a grade", () => {
    const g = gradeDoMes({ mes: "2026-08", disponiveis: ["2026-09-01"] })
    expect(g.flat().some((c) => c.disponivel)).toBe(false)
  })

  it("mês inválido devolve grade vazia em vez de quebrar", () => {
    expect(gradeDoMes({ mes: "banana", disponiveis: [] })).toEqual([])
    expect(gradeDoMes({ mes: "2026-13", disponiveis: [] })).toEqual([])
  })
})

describe("mesesDisponiveis", () => {
  it("agrupa e ordena, sem repetir", () => {
    expect(
      mesesDisponiveis(["2026-08-30", "2026-09-01", "2026-08-31", "2026-09-02"])
    ).toEqual(["2026-08", "2026-09"])
  })

  it("lista vazia devolve vazio", () => {
    expect(mesesDisponiveis([])).toEqual([])
  })
})

describe("mesDaData / rotuloDoDia / nomeDoMes", () => {
  it("extrai o mês", () => {
    expect(mesDaData("2026-08-17")).toBe("2026-08")
  })

  it("rótulo do dia em português, sem deslocar por fuso", () => {
    // 2026-08-17 é segunda. Se a conta usasse fuso local, poderia virar domingo.
    expect(rotuloDoDia("2026-08-17")).toBe("Segunda-feira, 17 de agosto")
  })

  it("nome do mês", () => {
    expect(nomeDoMes(2026, 8)).toBe("agosto de 2026")
  })
})
