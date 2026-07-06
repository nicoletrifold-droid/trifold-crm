import { describe, it, expect } from "vitest"
import { filterPastas, distinctValues, hasActiveFilters, EMPTY_FILTERS, type FilterablePasta } from "./filter"

const rows: FilterablePasta[] = [
  { nome: "Ana Souza", corretorNome: "João Silva", imobiliaria: "Imob Aurora", empreendimento: "Res. Aurora", status: "concluida", createdAt: "2026-07-01T10:00:00Z" },
  { nome: "Bruno Lima", corretorNome: "Pedro Rocha", imobiliaria: "Imob Beta", empreendimento: "Res. Beta", status: "em_analise", createdAt: "2026-07-05T10:00:00Z" },
  { nome: "Carla Dias", corretorNome: "João Silva", imobiliaria: null, empreendimento: "Res. Aurora", status: "aguardando", createdAt: "2026-07-10T10:00:00Z" },
]
const f = (patch: Partial<typeof EMPTY_FILTERS>) => ({ ...EMPTY_FILTERS, ...patch })

describe("filterPastas", () => {
  it("sem filtros retorna tudo", () => {
    expect(filterPastas(rows, EMPTY_FILTERS)).toHaveLength(3)
  })
  it("busca casa nome, corretor ou imobiliária (case-insensitive)", () => {
    expect(filterPastas(rows, f({ search: "ana" })).map((r) => r.nome)).toEqual(["Ana Souza"])
    expect(filterPastas(rows, f({ search: "joão" })).map((r) => r.nome)).toEqual(["Ana Souza", "Carla Dias"])
    expect(filterPastas(rows, f({ search: "beta" })).map((r) => r.nome)).toEqual(["Bruno Lima"])
  })
  it("filtra por status", () => {
    expect(filterPastas(rows, f({ status: "aguardando" })).map((r) => r.nome)).toEqual(["Carla Dias"])
  })
  it("filtra por empreendimento / corretor / imobiliária (exato)", () => {
    expect(filterPastas(rows, f({ empreendimento: "Res. Aurora" }))).toHaveLength(2)
    expect(filterPastas(rows, f({ corretor: "Pedro Rocha" })).map((r) => r.nome)).toEqual(["Bruno Lima"])
    expect(filterPastas(rows, f({ imobiliaria: "Imob Aurora" })).map((r) => r.nome)).toEqual(["Ana Souza"])
  })
  it("filtra por período (De/Até, inclusive e isolados)", () => {
    expect(filterPastas(rows, f({ dateFrom: "2026-07-05" })).map((r) => r.nome)).toEqual(["Bruno Lima", "Carla Dias"])
    expect(filterPastas(rows, f({ dateTo: "2026-07-05" })).map((r) => r.nome)).toEqual(["Ana Souza", "Bruno Lima"])
    expect(filterPastas(rows, f({ dateFrom: "2026-07-05", dateTo: "2026-07-05" })).map((r) => r.nome)).toEqual(["Bruno Lima"])
  })
  it("combina filtros com E", () => {
    expect(filterPastas(rows, f({ empreendimento: "Res. Aurora", corretor: "João Silva", status: "concluida" })).map((r) => r.nome)).toEqual(["Ana Souza"])
  })
})

describe("distinctValues", () => {
  it("distintos, ordenados, sem vazios", () => {
    expect(distinctValues(rows, "corretorNome")).toEqual(["João Silva", "Pedro Rocha"])
    expect(distinctValues(rows, "imobiliaria")).toEqual(["Imob Aurora", "Imob Beta"])
  })
})

describe("hasActiveFilters", () => {
  it("false quando vazio, true quando algo setado", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters(f({ search: "x" }))).toBe(true)
    expect(hasActiveFilters(f({ dateFrom: "2026-07-01" }))).toBe(true)
  })
})
