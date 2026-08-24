import { describe, it, expect } from "vitest"
import { decidirAcaoDoFollowUp } from "./decidir-acao"

// Configuração típica de uma regra de etapa: alerta em 1 dia, Nicole assume em 2.
const REGRA = { nicoleTakeoverDays: 2, alertDays: 1 }

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
        diasSemContato: 2,
        nicoleFollowUpOffAt: "2026-08-24T12:00:00.000Z",
      })
    ).toBe("alerta")
  })
})
