import { describe, expect, it } from "vitest"
import {
  LOST_REASON_GROUPS,
  LOST_REASON_GROUP_LABELS,
  isLostReasonGrupo,
} from "@web/lib/constants"
import { requiresLossBreakdown } from "@web/lib/agent/context-builder"

// Story 75-264 — o CHECK do banco (mig 212, leads_lost_reason_grupo_check) e a
// whitelist do app precisam falar dos MESMOS 7 slugs. Se este teste quebrar ao
// mexer em LOST_REASON_GROUPS, a migration correspondente precisa acompanhar.
describe("LOST_REASON_GROUPS (75-264)", () => {
  it("são exatamente os 7 slugs do CHECK da migration 212", () => {
    expect(LOST_REASON_GROUPS.map((g) => g.value)).toEqual([
      "nao_conseguimos_falar",
      "sem_interesse",
      "nao_qualifica_preco",
      "fora_perfil_regiao",
      "foi_para_outro",
      "clicou_sem_intencao",
      "outro",
    ])
  })

  it("todo grupo tem rótulo em LOST_REASON_GROUP_LABELS", () => {
    for (const g of LOST_REASON_GROUPS) {
      expect(LOST_REASON_GROUP_LABELS[g.value]).toBeTruthy()
    }
  })

  it("isLostReasonGrupo aceita a whitelist e rejeita o resto", () => {
    expect(isLostReasonGrupo("sem_interesse")).toBe(true)
    expect(isLostReasonGrupo("outro")).toBe(true)
    expect(isLostReasonGrupo("Sem Interesse")).toBe(false) // label ≠ slug
    expect(isLostReasonGrupo("sem_motivo")).toBe(false) // grupo só do legado (view)
    expect(isLostReasonGrupo("")).toBe(false)
    expect(isLostReasonGrupo(null)).toBe(false)
    expect(isLostReasonGrupo(undefined)).toBe(false)
    expect(isLostReasonGrupo(42)).toBe(false)
  })
})

describe("requiresLossBreakdown (75-264)", () => {
  it("dispara para perguntas sobre perda", () => {
    expect(requiresLossBreakdown("Por que perdemos os leads da campanha X?")).toBe(true)
    expect(requiresLossBreakdown("quantos leads PERDIDOS este mês?")).toBe(true)
    expect(requiresLossBreakdown("qual o maior motivo de perda?")).toBe(true)
  })

  it("não dispara para perguntas sem relação", () => {
    expect(requiresLossBreakdown("qual campanha tem o melhor CPL?")).toBe(false)
    expect(requiresLossBreakdown("quantas visitas agendadas hoje?")).toBe(false)
  })
})
