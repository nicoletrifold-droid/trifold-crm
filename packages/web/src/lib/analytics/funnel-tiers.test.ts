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
})
