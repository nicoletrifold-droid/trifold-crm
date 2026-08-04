import { describe, it, expect } from "vitest"
import {
  aggregateFilteredLeads,
  brokerDoLead,
  isStageFechamento,
  type AggregableLead,
  type StageDef,
} from "./aggregate-filtered"

// Story 75-271 — a soma que substitui a RPC quando há filtro. O que importa aqui
// é BATER com o que a RPC devolveria, senão tela e PDF divergem.

const STAGES: StageDef[] = [
  { id: "s1", name: "Aguardando atendimento", slug: "novo", position: 1 },
  { id: "s2", name: "1º Contato", slug: "contato", position: 2 },
  { id: "s3", name: "Fechamento", slug: "fechou", position: 3 },
]

const LEADS: AggregableLead[] = [
  { stage_id: "s1", assigned_broker_id: "b1", source: "meta_ads", property_interest_id: "p1", broker: { id: "b1", name: "Joabe" } },
  { stage_id: "s1", assigned_broker_id: "b1", source: "meta_ads", property_interest_id: "p1", broker: [{ id: "b1", name: "Joabe" }] },
  { stage_id: "s2", assigned_broker_id: "b2", source: "other", property_interest_id: "p2", broker: { id: "b2", name: "Thielly" } },
  { stage_id: "s2", assigned_broker_id: null, source: null, property_interest_id: null, broker: null },
  { stage_id: null, assigned_broker_id: "b3", source: "website", property_interest_id: "p1", broker: { id: "b3", name: "Corretor Demo" } },
]

describe("aggregateFilteredLeads", () => {
  const agg = aggregateFilteredLeads(LEADS, STAGES, {
    hiddenBrokerNames: new Set(["corretor demo"]),
  })

  it("conta por etapa e mantém a ORDEM das etapas recebidas", () => {
    expect(agg.stages.map((s) => [s.id, s.count])).toEqual([
      ["s1", 2],
      ["s2", 2],
      ["s3", 0], // etapa sem lead entra com 0 — funil não pode ter degrau faltando
    ])
  })

  it("normaliza o embed do PostgREST (objeto OU array de um item)", () => {
    // Os dois primeiros leads são do mesmo corretor, um com embed objeto e outro
    // com array. Se a normalização falhasse, viriam como corretores diferentes.
    expect(agg.brokers.find((b) => b.id === "b1")!.count).toBe(2)
  })

  it("esconde corretor da lista de ocultos", () => {
    expect(agg.brokers.map((b) => b.name)).not.toContain("Corretor Demo")
  })

  it("respeita activeBrokerIds quando informado (Story 75-53)", () => {
    const so_b1 = aggregateFilteredLeads(LEADS, STAGES, { activeBrokerIds: new Set(["b1"]) })
    expect(so_b1.brokers.map((b) => b.id)).toEqual(["b1"])
  })

  it("origem NULA cai em 'other', igual à RPC — total de origens fecha com o total", () => {
    expect(agg.sourceCounts).toEqual({ meta_ads: 2, other: 2, website: 1 })
    const somaOrigens = Object.values(agg.sourceCounts).reduce((a, b) => a + b, 0)
    expect(somaOrigens).toBe(agg.total)
  })

  it("conta por empreendimento e ignora lead sem empreendimento", () => {
    expect(agg.byProperty).toEqual({ p1: 3, p2: 1 })
  })

  it("ordena corretores por volume, desempatando por nome", () => {
    const empate = aggregateFilteredLeads(
      [
        { assigned_broker_id: "x", source: "a", broker: { id: "x", name: "Zeca" } },
        { assigned_broker_id: "y", source: "a", broker: { id: "y", name: "Ana" } },
      ],
      []
    )
    expect(empate.brokers.map((b) => b.name)).toEqual(["Ana", "Zeca"])
  })

  it("lista vazia devolve etapas zeradas e nada mais", () => {
    const vazio = aggregateFilteredLeads([], STAGES)
    expect(vazio.total).toBe(0)
    expect(vazio.brokers).toEqual([])
    expect(vazio.sourceCounts).toEqual({})
    expect(vazio.stages.every((s) => s.count === 0)).toBe(true)
  })

  it("lead sem corretor não inventa entrada", () => {
    expect(agg.brokers.some((b) => !b.id)).toBe(false)
  })
})

describe("brokerDoLead", () => {
  it("aceita objeto, array e null", () => {
    expect(brokerDoLead({ broker: { id: "a", name: "A" } })).toEqual({ id: "a", name: "A" })
    expect(brokerDoLead({ broker: [{ id: "a", name: "A" }] })).toEqual({ id: "a", name: "A" })
    expect(brokerDoLead({ broker: null })).toBeNull()
    expect(brokerDoLead({})).toBeNull()
    expect(brokerDoLead({ broker: [] })).toBeNull()
  })
})

describe("isStageFechamento", () => {
  it("reconhece pelo slug canônico e pelo nome (mesma régua da tela e do PDF)", () => {
    expect(isStageFechamento({ slug: "fechou", name: "Qualquer coisa" })).toBe(true)
    expect(isStageFechamento({ name: "Fechamento" })).toBe(true)
    expect(isStageFechamento({ name: "GANHO" })).toBe(true)
    expect(isStageFechamento({ name: "fechado" })).toBe(true)
  })

  it("não confunde etapa comum", () => {
    expect(isStageFechamento({ name: "1º Contato", slug: "contato" })).toBe(false)
    expect(isStageFechamento({ name: null, slug: null })).toBe(false)
  })
})
