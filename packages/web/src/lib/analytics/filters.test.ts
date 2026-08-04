import { describe, it, expect } from "vitest"
import {
  parseAnalyticsFilters,
  applyLeadFilters,
  matchesFilters,
  buildAnalyticsHref,
  buildClearFiltersHref,
  hasAnyFilter,
  activeFilterKeys,
  EMPTY_FILTERS,
  FILTER_KEYS,
  FILTER_SPEC,
  PERFIL_FILTER_KEYS,
  type AnalyticsFilters,
} from "./filters"

const BASE = "/dashboard/analytics"

/** Fake de query PostgREST: registra os `.eq()` recebidos. */
interface FakeQuery {
  calls: Array<[string, string]>
  ilikes: Array<[string, string]>
  eq(column: string, value: string): FakeQuery
  ilike(column: string, value: string): FakeQuery
}

function fakeQuery(): FakeQuery {
  const calls: Array<[string, string]> = []
  const ilikes: Array<[string, string]> = []
  const q: FakeQuery = {
    calls,
    ilikes,
    eq(column, value) {
      calls.push([column, value])
      return q
    },
    ilike(column, value) {
      ilikes.push([column, value])
      return q
    },
  }
  return q
}

describe("parseAnalyticsFilters", () => {
  it("lê de URLSearchParams e de searchParams do Next igualmente", () => {
    const esperado = { ...EMPTY_FILTERS, brokerId: "joabe", interestLevel: "hot" }
    expect(parseAnalyticsFilters(new URLSearchParams("broker_id=joabe&calor=hot"))).toEqual(esperado)
    expect(parseAnalyticsFilters({ broker_id: "joabe", calor: "hot" })).toEqual(esperado)
  })

  it("string vazia é AUSÊNCIA de filtro, não filtro por vazio", () => {
    // É o que chega quando o usuário escolhe "Todos" ou a URL tem `&broker_id=`.
    const f = parseAnalyticsFilters(new URLSearchParams("broker_id=&calor="))
    expect(f.brokerId).toBeNull()
    expect(f.interestLevel).toBeNull()
    expect(hasAnyFilter(f)).toBe(false)
  })

  it("espaço em branco também vira null", () => {
    expect(parseAnalyticsFilters({ broker_id: "   " }).brokerId).toBeNull()
  })

  it("array (param repetido na URL) usa o primeiro", () => {
    expect(parseAnalyticsFilters({ broker_id: ["a", "b"] }).brokerId).toBe("a")
  })

  it("sem nenhum parâmetro devolve EMPTY_FILTERS", () => {
    expect(parseAnalyticsFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS)
  })

  it("todas as dimensões do spec são lidas — nenhuma fica meio-implementada", () => {
    const sp = new URLSearchParams()
    for (const key of FILTER_KEYS) sp.set(FILTER_SPEC[key].param, `v-${key}`)
    const f = parseAnalyticsFilters(sp)
    for (const key of FILTER_KEYS) expect(f[key]).toBe(`v-${key}`)
  })
})

describe("applyLeadFilters", () => {
  it("aplica só as dimensões filtradas, na coluna certa", () => {
    const q = fakeQuery()
    applyLeadFilters(q, { ...EMPTY_FILTERS, brokerId: "b1", estadoCivil: "casado" })
    expect(q.calls).toEqual([
      ["assigned_broker_id", "b1"],
      ["estado_civil", "casado"],
    ])
  })

  it("sem filtro nenhum não toca a query", () => {
    const q = fakeQuery()
    applyLeadFilters(q, EMPTY_FILTERS)
    expect(q.calls).toEqual([])
  })

  it("`except` pula uma dimensão — base do comportamento facetado (R5 do @po)", () => {
    const q = fakeQuery()
    applyLeadFilters(
      q,
      { ...EMPTY_FILTERS, brokerId: "b1", estadoCivil: "casado" },
      "estadoCivil"
    )
    // Conta os casados de OUTROS estados civis? Não: conta com o corretor
    // aplicado e o estado civil livre, que é o que monta as opções da dimensão.
    expect(q.calls).toEqual([["assigned_broker_id", "b1"]])
  })

  it("property_id continua mapeando p/ property_interest_id (nome histórico)", () => {
    const q = fakeQuery()
    applyLeadFilters(q, parseAnalyticsFilters({ property_id: "p1" }))
    expect(q.calls).toEqual([["property_interest_id", "p1"]])
  })
})

describe("texto livre é case-insensitive — AC11", () => {
  it("profissao usa ilike (não eq), p/ casar com o agrupamento do rótulo", () => {
    const q = fakeQuery()
    applyLeadFilters(q, parseAnalyticsFilters({ profissao: "Engenheiro" }))
    expect(q.ilikes).toEqual([["profissao", "Engenheiro"]])
    expect(q.calls).toEqual([]) // nenhum eq
  })

  it("cidade_bairro também (texto livre)", () => {
    const q = fakeQuery()
    applyLeadFilters(q, parseAnalyticsFilters({ cidade_bairro: "Zona 7" }))
    expect(q.ilikes).toEqual([["cidade_bairro", "Zona 7"]])
  })

  it("curinga do LIKE é escapado — '100%' não vira busca por prefixo", () => {
    const q = fakeQuery()
    applyLeadFilters(q, parseAnalyticsFilters({ profissao: "Sócio 100% MEI_x" }))
    expect(q.ilikes[0]![1]).toBe("Sócio 100\\% MEI\\_x")
  })

  it("dimensão de enum segue com eq (calor, filhos, pet)", () => {
    const q = fakeQuery()
    applyLeadFilters(q, parseAnalyticsFilters({ calor: "hot", filhos: "2", pet: "sim" }))
    expect(q.ilikes).toEqual([])
    expect(q.calls).toHaveLength(3)
  })

  it("matchesFilters ignora caixa e espaço nas dimensões de texto livre", () => {
    const f = parseAnalyticsFilters({ profissao: "Engenheiro" })
    for (const grafia of ["Engenheiro", "engenheiro", "ENGENHEIRO", "  Engenheiro  "]) {
      expect(matchesFilters({ profissao: grafia }, f)).toBe(true)
    }
    expect(matchesFilters({ profissao: "Engenheira" }, f)).toBe(false)
    expect(matchesFilters({ profissao: null }, f)).toBe(false)
  })

  it("mas NÃO ignora caixa em dimensão de enum", () => {
    expect(matchesFilters({ interest_level: "HOT" }, parseAnalyticsFilters({ calor: "hot" }))).toBe(false)
  })
})

describe("matchesFilters", () => {
  const filtros: AnalyticsFilters = { ...EMPTY_FILTERS, brokerId: "b1", interestLevel: "hot" }

  it("aceita linha que casa com todos os filtros", () => {
    expect(matchesFilters({ assigned_broker_id: "b1", interest_level: "hot" }, filtros)).toBe(true)
  })

  it("rejeita linha que falha em qualquer filtro", () => {
    expect(matchesFilters({ assigned_broker_id: "b2", interest_level: "hot" }, filtros)).toBe(false)
    expect(matchesFilters({ assigned_broker_id: "b1", interest_level: "cold" }, filtros)).toBe(false)
  })

  it("campo null na linha não casa com filtro ativo", () => {
    expect(matchesFilters({ assigned_broker_id: null, interest_level: "hot" }, filtros)).toBe(false)
  })

  it("`except` ignora a dimensão, igual ao applyLeadFilters", () => {
    expect(
      matchesFilters({ assigned_broker_id: "b1", interest_level: "cold" }, filtros, "interestLevel")
    ).toBe(true)
  })
})

describe("buildAnalyticsHref — o AC2 (filtros não se atropelam)", () => {
  it("trocar empreendimento PRESERVA o corretor — o bug que existia", () => {
    const atuais = parseAnalyticsFilters({ broker_id: "joabe", property_id: "vind" })
    const href = buildAnalyticsHref(BASE, atuais, {}, { propertyId: "yarden" })
    const sp = new URLSearchParams(href.split("?")[1])
    expect(sp.get("property_id")).toBe("yarden")
    expect(sp.get("broker_id")).toBe("joabe") // <- antes isto sumia
  })

  it("trocar o período preserva TODOS os filtros", () => {
    const atuais = parseAnalyticsFilters({ broker_id: "joabe", calor: "hot", estado_civil: "casado" })
    const sp = new URLSearchParams(buildAnalyticsHref(BASE, atuais, { range: "90d" }).split("?")[1])
    expect(sp.get("range")).toBe("90d")
    expect(sp.get("broker_id")).toBe("joabe")
    expect(sp.get("calor")).toBe("hot")
    expect(sp.get("estado_civil")).toBe("casado")
  })

  it("override null REMOVE o parâmetro (AC8: não deixa `&broker_id=`)", () => {
    const atuais = parseAnalyticsFilters({ broker_id: "joabe", calor: "hot" })
    const href = buildAnalyticsHref(BASE, atuais, {}, { brokerId: null })
    expect(href).not.toContain("broker_id")
    expect(href).toContain("calor=hot")
  })

  it("range=30d fica implícito (é o default da tela, como já era)", () => {
    expect(buildAnalyticsHref(BASE, EMPTY_FILTERS, { range: "30d" })).toBe(BASE)
  })

  it("from/to só entram no range custom", () => {
    const custom = buildAnalyticsHref(BASE, EMPTY_FILTERS, { range: "custom", from: "2026-01-01", to: "2026-02-01" })
    expect(custom).toContain("from=2026-01-01")
    expect(custom).toContain("to=2026-02-01")
    const preset = buildAnalyticsHref(BASE, EMPTY_FILTERS, { range: "90d", from: "2026-01-01" })
    expect(preset).not.toContain("from=")
  })

  it("sem filtro nem período devolve o path pelado (sem `?`)", () => {
    expect(buildAnalyticsHref(BASE, EMPTY_FILTERS)).toBe(BASE)
  })

  it("é idempotente: parse → build → parse dá o mesmo objeto", () => {
    const original = parseAnalyticsFilters({
      broker_id: "b", property_id: "p", calor: "hot", profissao: "Engenheiro", pet: "sim",
    })
    const href = buildAnalyticsHref(BASE, original)
    expect(parseAnalyticsFilters(new URLSearchParams(href.split("?")[1]))).toEqual(original)
  })

  it("valor com espaço/acento sobrevive ao round-trip (profissão é texto livre)", () => {
    const original = parseAnalyticsFilters({ profissao: "Técnico em Edificações" })
    const href = buildAnalyticsHref(BASE, original)
    expect(parseAnalyticsFilters(new URLSearchParams(href.split("?")[1])).profissao).toBe(
      "Técnico em Edificações"
    )
  })
})

describe("buildClearFiltersHref", () => {
  it("limpa filtros e preserva o período (AC8)", () => {
    expect(buildClearFiltersHref(BASE, { range: "90d" })).toBe(`${BASE}?range=90d`)
  })

  it("sem período volta ao path pelado", () => {
    expect(buildClearFiltersHref(BASE)).toBe(BASE)
  })
})

describe("hasAnyFilter / activeFilterKeys", () => {
  it("distingue vazio de filtrado", () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false)
    expect(hasAnyFilter({ ...EMPTY_FILTERS, temPet: "sim" })).toBe(true)
  })

  it("lista as dimensões ativas na ordem do spec", () => {
    const f = { ...EMPTY_FILTERS, temPet: "sim", brokerId: "b" }
    expect(activeFilterKeys(f)).toEqual(["brokerId", "temPet"])
  })
})

describe("integridade do spec", () => {
  it("todo filtro de perfil existe no spec", () => {
    for (const k of PERFIL_FILTER_KEYS) expect(FILTER_KEYS).toContain(k)
  })

  it("params e colunas são únicos (sem colisão silenciosa)", () => {
    const params = FILTER_KEYS.map((k) => FILTER_SPEC[k].param)
    const cols = FILTER_KEYS.map((k) => FILTER_SPEC[k].column)
    expect(new Set(params).size).toBe(params.length)
    expect(new Set(cols).size).toBe(cols.length)
  })

  it("corretor e calor — os dois filtros densos — estão presentes", () => {
    expect(FILTER_SPEC.brokerId.column).toBe("assigned_broker_id")
    expect(FILTER_SPEC.interestLevel.column).toBe("interest_level")
  })
})
