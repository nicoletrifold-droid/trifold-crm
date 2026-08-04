/**
 * Story 75-179 — Tests para deriveAnalyticsMetrics (fonte única tela+PDF).
 * Story 75-266 — Tests para deriveLostReasonGroups (card Motivos de Perda).
 */
import { describe, it, expect } from "vitest"
import { deriveAnalyticsMetrics, deriveLostReasonGroups, toCount, type AnalyticsSummary } from "./metrics"
import { LOST_REASON_GROUPS, LOST_REASON_ALL_GROUP_LABELS } from "@web/lib/constants"

const base: AnalyticsSummary = {
  funnel: null, by_property: null, by_broker: null, source_counts: null,
  lost_reasons: null, total_leads: 0, new_leads: 0,
}

describe("deriveAnalyticsMetrics (Story 75-179)", () => {
  it("entradas ⊇ ativos e perdidos (subconjuntos)", () => {
    const m = deriveAnalyticsMetrics({
      ...base,
      total_leads: 173,
      new_leads: 135,
      lost_reasons: { desistiu: 20, "sem perfil": 12 },
    })
    expect(m).toEqual({ entradas: 173, ativos: 135, perdidos: 32 })
  })

  it("aceita valores string (jsonb) e nulos", () => {
    const m = deriveAnalyticsMetrics({
      ...base,
      total_leads: "50",
      new_leads: "40",
      lost_reasons: { x: "7", y: "3" },
    })
    expect(m).toEqual({ entradas: 50, ativos: 40, perdidos: 10 })
  })

  it("summary nulo → tudo zero (não quebra)", () => {
    expect(deriveAnalyticsMetrics(null)).toEqual({ entradas: 0, ativos: 0, perdidos: 0 })
  })

  it("toCount é robusto a lixo", () => {
    expect(toCount("não-numero")).toBe(0)
    expect(toCount(null)).toBe(0)
    expect(toCount(12)).toBe(12)
  })
})

describe("deriveLostReasonGroups (Story 75-266)", () => {
  it("ordena por contagem desc e traduz slug → label PT", () => {
    const rows = deriveLostReasonGroups({
      sem_interesse: 3,
      nao_conseguimos_falar: "12",
      nao_classificado: 5,
    })
    expect(rows.map((r) => r.grupo)).toEqual(["nao_conseguimos_falar", "nao_classificado", "sem_interesse"])
    expect(rows[0]).toEqual({ grupo: "nao_conseguimos_falar", label: LOST_REASON_ALL_GROUP_LABELS.nao_conseguimos_falar, count: 12 })
  })

  it("slug desconhecido não some do card — aparece cru", () => {
    const rows = deriveLostReasonGroups({ grupo_futuro: 2 })
    expect(rows).toEqual([{ grupo: "grupo_futuro", label: "grupo_futuro", count: 2 }])
  })

  it("descarta contagem zero/lixo e aceita mapa nulo", () => {
    expect(deriveLostReasonGroups({ sem_interesse: 0, outro: "x" })).toEqual([])
    expect(deriveLostReasonGroups(null)).toEqual([])
    expect(deriveLostReasonGroups(undefined)).toEqual([])
  })

  it("a soma das linhas é o KPI Perdidos (mesmo universo, AC2)", () => {
    const groups = { nao_conseguimos_falar: 7, sem_interesse: 2, nao_classificado: 1 }
    const somaCard = deriveLostReasonGroups(groups).reduce((s, r) => s + r.count, 0)
    const perdidos = Object.values(groups).reduce((s, v) => s + toCount(v), 0)
    expect(somaCard).toBe(perdidos)
  })

  it("todo grupo escolhível (mig 212) e todo grupo só-legado tem label na fonte única", () => {
    for (const g of LOST_REASON_GROUPS) {
      expect(LOST_REASON_ALL_GROUP_LABELS[g.value]).toBe(g.label)
    }
    for (const legado of ["duplicado_teste_corretor", "sem_motivo", "nao_classificado"]) {
      expect(LOST_REASON_ALL_GROUP_LABELS[legado]).toBeTruthy()
    }
  })
})
