// Story 75-318 — mapeamento das etapas do período para os 4 andares do funil.
import { describe, expect, it } from "vitest"
import { pickFunnelTiers } from "./funnel-tiers"

const STAGES = [
  { name: "Aguardando atendimento", slug: "aguardando", color: "#888", count: 0 },
  { name: "Atendimento", slug: "atendimento", color: "#e05252", count: 70 },
  { name: "Visita Agendada", slug: "visita-agendada", color: "#7c5cd6", count: 9 },
  { name: "Visitou", slug: "visitou", color: "#38a3c4", count: 8 },
  { name: "Proposta", slug: "proposta", color: "#76a84e", count: 2 },
  { name: "Fechamento", slug: "fechamento", color: "#a855f7", count: 0 },
  { name: "Represamento", slug: "represamento", color: "#7c3aed", count: 72 },
]

describe("pickFunnelTiers", () => {
  it("mapeia os 5 números certos e ignora as demais etapas", () => {
    const t = pickFunnelTiers(STAGES)
    expect(t.atendimento.count).toBe(70)
    expect(t.visitaAgendada.count).toBe(9)
    expect(t.visitou.count).toBe(8)
    expect(t.proposta.count).toBe(2)
    expect(t.fechamento.count).toBe(0)
  })

  it("usa a COR da etapa do pipeline (VA ≠ Visitou — o pedido do mesmo andar com cores distintas)", () => {
    const t = pickFunnelTiers(STAGES)
    expect(t.visitaAgendada.color).toBe("#7c5cd6")
    expect(t.visitou.color).toBe("#38a3c4")
    expect(t.visitaAgendada.color).not.toBe(t.visitou.color)
  })

  it("etapa ausente → count 0 + label/cor padrão (não quebra)", () => {
    const t = pickFunnelTiers([])
    expect(t.proposta).toEqual({ label: "Proposta", count: 0, color: "#76a84e" })
  })

  it("fallback por NOME quando o slug diverge (acentos normalizados)", () => {
    const t = pickFunnelTiers([{ name: "Visita Agendada", slug: "etapa-x", color: "#123456", count: 5 }])
    expect(t.visitaAgendada.count).toBe(5)
    expect(t.visitaAgendada.color).toBe("#123456")
  })

  // Story 75-323 — em PROD a etapa "Atendimento" tem slug `no-show` e a "Fechamento"
  // tem slug `fechou`. Os dois andares só funcionavam pelo fallback de nome; renomear
  // a etapa em Configurações → Pipeline zerava o funil sem avisar. Este teste usa os
  // slugs reais e nomes trocados de propósito, para provar que agora casa pelo slug.
  it("casa pelos slugs REAIS de prod, sem depender do nome", () => {
    const t = pickFunnelTiers([
      { name: "Atendimento (renomeado)", slug: "no-show", color: "#111", count: 36 },
      { name: "Fechamento (renomeado)", slug: "fechou", color: "#222", count: 3 },
    ])
    expect(t.atendimento.count).toBe(36)
    expect(t.fechamento.count).toBe(3)
  })
})

// Story 75-320 — nível do líquido proporcional ao volume
import { liquidFillFraction } from "./funnel-tiers"

describe("liquidFillFraction", () => {
  it("andar com o maior volume fica no teto (0.88)", () => {
    expect(liquidFillFraction(31, 31)).toBeCloseTo(0.88, 5)
  })

  it("andar zerado fica no piso de 10% — nunca sem cor", () => {
    expect(liquidFillFraction(0, 31)).toBeCloseTo(0.1, 5)
  })

  it("todos zerados (max=0) não divide por zero: piso", () => {
    expect(liquidFillFraction(0, 0)).toBeCloseTo(0.1, 5)
  })

  it("é monotônica e suavizada (√): 4/31 rende nível visível > proporção crua", () => {
    const n1 = liquidFillFraction(1, 31)
    const n4 = liquidFillFraction(4, 31)
    const n31 = liquidFillFraction(31, 31)
    expect(n1).toBeGreaterThan(0.1)
    expect(n4).toBeGreaterThan(n1)
    expect(n31).toBeGreaterThan(n4)
    expect(n4).toBeGreaterThan(0.1 + 0.78 * (4 / 31)) // acima da linear
  })

  it("count acima do max não estoura o teto", () => {
    expect(liquidFillFraction(50, 31)).toBeCloseTo(0.88, 5)
  })
})
