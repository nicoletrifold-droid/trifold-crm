import { describe, it, expect } from "vitest"
import { decidirAcaoDoFollowUp } from "./decidir-acao"

// Configuração típica de uma regra de etapa: alerta em 1 dia, Nicole assume em 2.
const REGRA = { nicoleTakeoverDays: 2, alertDays: 1, temConversa: true }

describe("decidirAcaoDoFollowUp (Story 75-368)", () => {
  it("AC3 — ligado e acima do takeover: a Nicole envia, como hoje", () => {
    expect(
      decidirAcaoDoFollowUp({ ...REGRA, diasSemContato: 5, nicoleFollowUpOffAt: null })
    ).toBe("nicole")
  })

  it("AC2 — desligado silencia a Nicole", () => {
    expect(
      decidirAcaoDoFollowUp({
        ...REGRA,
        diasSemContato: 5,
        nicoleFollowUpOffAt: "2026-08-24T12:00:00.000Z",
      })
    ).not.toBe("nicole")
  })

  it("AC2 — desligado AINDA alerta o corretor (a cascata do else if)", () => {
    expect(
      decidirAcaoDoFollowUp({
        ...REGRA,
        diasSemContato: 5,
        nicoleFollowUpOffAt: "2026-08-24T12:00:00.000Z",
      })
    ).toBe("alerta")
  })

  it("AC3 — ligado, entre alert_days e takeover: alerta, como hoje", () => {
    expect(
      decidirAcaoDoFollowUp({ ...REGRA, diasSemContato: 1, nicoleFollowUpOffAt: null })
    ).toBe("alerta")
  })

  it("AC6 — borda: desligado e ABAIXO de alert_days não gera nada", () => {
    expect(
      decidirAcaoDoFollowUp({
        ...REGRA,
        diasSemContato: 0,
        nicoleFollowUpOffAt: "2026-08-24T12:00:00.000Z",
      })
    ).toBe("nada")
  })

  it("AC3 — ligado e abaixo de alert_days não gera nada", () => {
    expect(
      decidirAcaoDoFollowUp({ ...REGRA, diasSemContato: 0, nicoleFollowUpOffAt: null })
    ).toBe("nada")
  })

  it("regra sem folga (takeover == alert): desligado cai no alerta, não no vazio", () => {
    expect(
      decidirAcaoDoFollowUp({
        nicoleTakeoverDays: 2,
        alertDays: 2,
        temConversa: true,
        diasSemContato: 2,
        nicoleFollowUpOffAt: "2026-08-24T12:00:00.000Z",
      })
    ).toBe("alerta")
  })

  // ── H1 (revisão do @qa, 24/08) ──────────────────────────────────────────
  // O ramo `alert_broker` sempre exigiu conversa. Até a 75-368 isso era
  // garantido por construção; a cascata desta story rompia a garantia no caso
  // principal do pedido: lead novo de Meta Ads, sem conversa, desligado.

  it("H1 — desligado e SEM conversa não alerta o corretor: silêncio", () => {
    expect(
      decidirAcaoDoFollowUp({
        ...REGRA,
        temConversa: false,
        diasSemContato: 5,
        nicoleFollowUpOffAt: "2026-08-24T12:00:00.000Z",
      })
    ).toBe("nada")
  })

  it("H1 — ligado e SEM conversa acima do takeover: a Nicole ainda envia (template)", () => {
    expect(
      decidirAcaoDoFollowUp({
        ...REGRA,
        temConversa: false,
        diasSemContato: 5,
        nicoleFollowUpOffAt: null,
      })
    ).toBe("nicole")
  })

  // Estado NÃO alcançável em produção — provado ao revisar o H1: sem conversa,
  // `daysSinceLastContact` é sempre igual ao preliminar, e `podeFollowUpSemConversa`
  // só deixa passar quem já cruzou o takeover. O teste documenta a invariante; não
  // é mudança de comportamento para lead ligado (AC3 intacta).
  it("H1 — ligado, SEM conversa, entre alert_days e takeover: nada (invariante antiga, agora checada)", () => {
    expect(
      decidirAcaoDoFollowUp({
        ...REGRA,
        temConversa: false,
        diasSemContato: 1,
        nicoleFollowUpOffAt: null,
      })
    ).toBe("nada")
  })
})
