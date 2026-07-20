/**
 * Story 75-184 — Tests p/ aggregatePerfil (Perfil dos Leads no Analytics).
 */
import { describe, it, expect } from "vitest"
import { aggregatePerfil, type PerfilRow } from "./perfil"

const empty = (over: Partial<PerfilRow> = {}): PerfilRow => ({
  profissao: null, renda_familiar: null, filhos: null, estado_civil: null,
  faixa_etaria: null, situacao_moradia: null, tem_pet: null, ...over,
})

describe("aggregatePerfil (Story 75-184)", () => {
  it("conta faixas na ordem natural das opções (não por volume)", () => {
    const rows = [
      empty({ renda_familiar: "acima_20000" }),
      empty({ renda_familiar: "ate_2850" }),
      empty({ renda_familiar: "acima_20000" }),
    ]
    const agg = aggregatePerfil(rows)
    expect(agg.renda.map((r) => r.label)).toEqual(["Até R$ 2.850", "Acima de R$ 20.000"])
    expect(agg.renda.map((r) => r.count)).toEqual([1, 2])
  })

  it("profissão: agrupa case-insensitive, top por contagem", () => {
    const rows = [
      empty({ profissao: "Advogado(a)" }),
      empty({ profissao: "advogado(a)" }),
      empty({ profissao: "Professora" }),
    ]
    const agg = aggregatePerfil(rows)
    expect(agg.profissao[0]).toEqual({ label: "Advogado(a)", count: 2 })
    expect(agg.profissao[1]).toEqual({ label: "Professora", count: 1 })
  })

  it("profissão: limita ao top 8", () => {
    const rows = Array.from({ length: 12 }, (_, i) => empty({ profissao: `Prof ${i}` }))
    expect(aggregatePerfil(rows).profissao).toHaveLength(8)
  })

  it("comPerfil conta leads com pelo menos 1 campo; total conta todos", () => {
    const rows = [empty({ tem_pet: "sim" }), empty(), empty({ filhos: "2" })]
    const agg = aggregatePerfil(rows)
    expect(agg.comPerfil).toBe(2)
    expect(agg.total).toBe(3)
  })

  it("dimensões vazias somem (sem linhas zeradas)", () => {
    const agg = aggregatePerfil([empty()])
    expect(agg.renda).toEqual([])
    expect(agg.pet).toEqual([])
    expect(agg.profissao).toEqual([])
  })

  it("labels legíveis resolvidos das opções", () => {
    const agg = aggregatePerfil([empty({ situacao_moradia: "aluguel", tem_pet: "nao", faixa_etaria: "35_44" })])
    expect(agg.moradia[0]!.label).toBe("Mora de aluguel")
    expect(agg.pet[0]!.label).toBe("Não")
    expect(agg.faixaEtaria[0]!.label).toBe("35 a 44 anos")
  })
})
