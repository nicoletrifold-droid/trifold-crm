import { describe, it, expect } from "vitest"
import {
  facetOptions,
  facetCoverage,
  optionLabelComContagem,
  labelDoValor,
  brokerFilterOptions,
  coverageNote,
} from "./filter-options"
import { EMPTY_FILTERS, parseAnalyticsFilters } from "./filters"
import { INTEREST_LEVEL_LABELS } from "@web/lib/constants"

// Story 75-272 — opções facetadas com contagem. Os dados abaixo imitam a
// realidade medida em prod: corretor e calor densos, perfil ralo.

const ROWS = [
  { assigned_broker_id: "joabe", interest_level: "hot", estado_civil: "casado", profissao: "Engenheiro" },
  { assigned_broker_id: "joabe", interest_level: "hot", estado_civil: "solteiro", profissao: "engenheiro" },
  { assigned_broker_id: "joabe", interest_level: "warm", estado_civil: null, profissao: null },
  { assigned_broker_id: "thielly", interest_level: "hot", estado_civil: "casado", profissao: "ENGENHEIRO" },
  { assigned_broker_id: "thielly", interest_level: "cold", estado_civil: null, profissao: "Médico" },
  { assigned_broker_id: null, interest_level: null, estado_civil: null, profissao: null },
]

describe("facetOptions", () => {
  it("conta e ordena por volume decrescente", () => {
    const opts = facetOptions(ROWS, EMPTY_FILTERS, "brokerId")
    expect(opts).toEqual([
      { value: "joabe", label: "joabe", count: 3 },
      { value: "thielly", label: "thielly", count: 2 },
    ])
  })

  it("ignora null/vazio — filtro não oferece 'sem valor'", () => {
    const opts = facetOptions(ROWS, EMPTY_FILTERS, "estadoCivil")
    expect(opts.map((o) => o.value)).toEqual(["casado", "solteiro"])
    expect(opts.find((o) => o.value === "casado")!.count).toBe(2)
  })

  it("FACETADO: com corretor filtrado, conta só os leads dele (R5 do @po)", () => {
    const f = parseAnalyticsFilters({ broker_id: "joabe" })
    const opts = facetOptions(ROWS, f, "estadoCivil")
    // Do Joabe: 1 casado + 1 solteiro (o terceiro é null)
    expect(opts).toEqual([
      { value: "casado", label: "casado", count: 1 },
      { value: "solteiro", label: "solteiro", count: 1 },
    ])
  })

  it("FACETADO: a própria dimensão fica LIVRE — não se auto-colapsa", () => {
    // Com "casado" selecionado, a lista de estado civil ainda mostra solteiro:
    // sem isso não haveria como trocar de opção.
    const f = parseAnalyticsFilters({ estado_civil: "casado" })
    const opts = facetOptions(ROWS, f, "estadoCivil")
    expect(opts.map((o) => o.value)).toEqual(["casado", "solteiro"])
  })

  it("nenhuma opção leva a resultado vazio quando combinada (AC4)", () => {
    // Para cada dimensão e cada opção oferecida, aplicar aquela opção sobre os
    // filtros vigentes tem de sobrar ao menos 1 linha.
    const vigentes = parseAnalyticsFilters({ broker_id: "thielly" })
    for (const opt of facetOptions(ROWS, vigentes, "estadoCivil")) {
      const combinado = parseAnalyticsFilters({ broker_id: "thielly", estado_civil: opt.value })
      const sobrou = facetOptions(ROWS, combinado, "brokerId")
      expect(sobrou.length).toBeGreaterThan(0)
    }
  })

  it("texto livre agrupa sem caixa e usa a grafia MAIS COMUM como rótulo (AC11)", () => {
    // "Engenheiro" / "engenheiro" / "ENGENHEIRO" = 1 grupo de 3.
    const opts = facetOptions(ROWS, EMPTY_FILTERS, "profissao")
    const eng = opts.find((o) => o.label.toLowerCase() === "engenheiro")!
    expect(eng.count).toBe(3)
    expect(opts).toHaveLength(2) // Engenheiro + Médico
  })

  it("empate de grafia é DETERMINÍSTICO — a ordem das linhas não muda o rótulo", () => {
    // O que importa não é QUAL grafia vence o empate (em pt-BR o localeCompare
    // põe minúscula antes), é a mesma entrada sempre dar o mesmo rótulo — senão
    // o texto do filtro oscila entre renders com dados idênticos.
    const rows = [{ profissao: "Alfa" }, { profissao: "alfa" }]
    const direto = facetOptions(rows, EMPTY_FILTERS, "profissao")
    const invertido = facetOptions([...rows].reverse(), EMPTY_FILTERS, "profissao")
    expect(direto).toEqual(invertido)
    expect(direto).toHaveLength(1)
    expect(direto[0]!.count).toBe(2)
  })

  it("a contagem do rótulo é a contagem que o filtro devolve (AC11)", () => {
    const opts = facetOptions(ROWS, EMPTY_FILTERS, "profissao")
    for (const opt of opts) {
      const f = parseAnalyticsFilters({ profissao: opt.value })
      const devolvidas = ROWS.filter((r) =>
        typeof r.profissao === "string" &&
        r.profissao.trim().toLowerCase() === opt.value.trim().toLowerCase()
      )
      expect(devolvidas).toHaveLength(opt.count)
      expect(f.profissao).toBe(opt.value)
    }
  })

  it("usa mapa de rótulos externo quando fornecido (corretor → nome)", () => {
    const nomes = new Map([["joabe", "Joabe Albuquerque"], ["thielly", "Thielly"]])
    const opts = facetOptions(ROWS, EMPTY_FILTERS, "brokerId", nomes)
    expect(opts[0]!.label).toBe("Joabe Albuquerque")
  })

  it("calor usa INTEREST_LEVEL_LABELS (fonte única, não cópia)", () => {
    const opts = facetOptions(ROWS, EMPTY_FILTERS, "interestLevel")
    expect(opts[0]!).toEqual({ value: "hot", label: INTEREST_LEVEL_LABELS.hot, count: 3 })
    expect(opts.map((o) => o.label)).not.toContain("hot")
  })

  it("lista vazia devolve nenhuma opção", () => {
    expect(facetOptions([], EMPTY_FILTERS, "brokerId")).toEqual([])
  })
})

describe("facetCoverage — o aviso do AC5", () => {
  it("informa quantas linhas têm o campo, sobre quantas no total", () => {
    // estado_civil: 3 de 6 preenchidos (imita os ~2% de prod)
    expect(facetCoverage(ROWS, EMPTY_FILTERS, "estadoCivil")).toEqual({ comValor: 3, total: 6 })
  })

  it("respeita os outros filtros ativos", () => {
    const f = parseAnalyticsFilters({ broker_id: "joabe" })
    expect(facetCoverage(ROWS, f, "estadoCivil")).toEqual({ comValor: 2, total: 3 })
  })

  it("dimensão densa tem cobertura alta (corretor)", () => {
    expect(facetCoverage(ROWS, EMPTY_FILTERS, "brokerId")).toEqual({ comValor: 5, total: 6 })
  })
})

// Story 75-274 — o defeito de prod: o mapa de nomes vinha do card "Leads por
// Corretor", derivado dos leads JÁ filtrados, então com um corretor selecionado
// sobrava um nome e os outros seis saíam como uuid no dropdown.
describe("brokerFilterOptions", () => {
  const NOMES = new Map([
    ["joabe", "Joabe Albuquerque"],
    ["thielly", "Thielly"],
  ])

  it("rotula toda opção com nome (AC1)", () => {
    const opts = brokerFilterOptions(ROWS, EMPTY_FILTERS, NOMES)
    expect(opts.map((o) => o.label)).toEqual(["Joabe Albuquerque", "Thielly"])
  })

  it("mapa incompleto NÃO produz opção com uuid — ela não entra (AC6)", () => {
    const soUm = new Map([["thielly", "Thielly"]])
    const opts = brokerFilterOptions(ROWS, EMPTY_FILTERS, soUm)
    expect(opts).toEqual([{ value: "thielly", label: "Thielly", count: 2 }])
    expect(opts.map((o) => o.label)).not.toContain("joabe")
  })

  it("FACETADO: com um corretor selecionado, os OUTROS seguem na lista com nome (AC1)", () => {
    // O caso exato do print: broker_id=thielly na URL. A dimensão fica livre de
    // propósito (senão não há como trocar), e é justamente aí que faltava nome.
    const f = parseAnalyticsFilters({ broker_id: "thielly" })
    const opts = brokerFilterOptions(ROWS, f, NOMES)
    expect(opts.map((o) => o.label)).toEqual(["Joabe Albuquerque", "Thielly"])
  })

  it("corretor oculto sai da lista mesmo com outro selecionado (AC3)", () => {
    // Antes o rótulo era uuid e a peneira, que compara por NOME, não pegava.
    const nomes = new Map([...NOMES, ["demo-id", "Corretor Demo"]])
    const rows = [...ROWS, { assigned_broker_id: "demo-id", interest_level: "hot" }]
    const f = parseAnalyticsFilters({ broker_id: "thielly" })
    const opts = brokerFilterOptions(rows, f, nomes, new Set(["corretor demo"]))
    expect(opts.map((o) => o.value)).toEqual(["joabe", "thielly"])
  })

  it("contagens seguem as mesmas de facetOptions (o defeito era só de rótulo — AC2)", () => {
    const cru = facetOptions(ROWS, EMPTY_FILTERS, "brokerId")
    const comNome = brokerFilterOptions(ROWS, EMPTY_FILTERS, NOMES)
    expect(comNome.map((o) => o.count)).toEqual(cru.map((o) => o.count))
  })
})

describe("coverageNote", () => {
  it("avisa quando falta o dado em parte do recorte (AC4)", () => {
    // Medido em prod: 28 frios + 1 morno + 21 sem calor num recorte de 50.
    expect(coverageNote({ comValor: 29, total: 50 })).toBe("29 de 50 com o dado")
  })

  it("cala quando a cobertura é total — aviso sempre visível não é lido (AC5)", () => {
    expect(coverageNote({ comValor: 50, total: 50 })).toBeNull()
    expect(coverageNote({ comValor: 0, total: 0 })).toBeNull()
  })

  it("formata milhar em pt-BR (o número é para ler, não para contar dígito)", () => {
    expect(coverageNote({ comValor: 31, total: 1657 })).toBe("31 de 1.657 com o dado")
  })
})

describe("rótulos", () => {
  it("contagem entra no texto da opção", () => {
    expect(optionLabelComContagem({ value: "casado", label: "Casado", count: 31 })).toBe("Casado (31)")
  })

  it("finalidade e pet ganham rótulo humano", () => {
    expect(labelDoValor("finalidade", "moradia")).toBe("Moradia")
    expect(labelDoValor("temPet", "sim")).toBe("Sim")
  })

  it("valor sem rótulo conhecido aparece como ele mesmo (nunca desaparece)", () => {
    expect(labelDoValor("finalidade", "aluguel_temporada")).toBe("aluguel_temporada")
    expect(labelDoValor("profissao", "Piloto de drone")).toBe("Piloto de drone")
  })
})
