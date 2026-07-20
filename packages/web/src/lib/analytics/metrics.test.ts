/**
 * Story 75-179 — Tests para deriveAnalyticsMetrics (fonte única tela+PDF).
 */
import { describe, it, expect } from "vitest"
import { deriveAnalyticsMetrics, toCount, type AnalyticsSummary } from "./metrics"

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
