import { describe, it, expect } from "vitest"
import { deveReengajarNoShow } from "./no-show-reengage"

/**
 * Story 75-358 — o teste que teria pegado o bug em 08/06/2026, quando a etapa
 * `…0009` deixou de ser "No-Show" e virou "Atendimento" na tela de Pipeline.
 *
 * O primeiro caso é literalmente o de produção de 20/08: lead sem nenhum
 * agendamento sendo acusado de furar visita.
 */
describe("75-358 — reengajamento de no-show sai do FATO, não da etapa", () => {
  it("lead sem nenhum agendamento nunca entra (os 4 casos de 20/08)", () => {
    expect(deveReengajarNoShow([])).toBe(false)
    expect(deveReengajarNoShow(null)).toBe(false)
    expect(deveReengajarNoShow(undefined)).toBe(false)
  })

  it("faltou e não voltou → entra", () => {
    expect(
      deveReengajarNoShow([{ status: "no_show", scheduled_at: "2026-08-14T13:00:00Z" }])
    ).toBe(true)
  })

  it("faltou e REMARCOU → não entra (não convidar a desmarcar o que está marcado)", () => {
    expect(
      deveReengajarNoShow([
        { status: "no_show", scheduled_at: "2026-08-14T13:00:00Z" },
        { status: "scheduled", scheduled_at: "2026-08-22T18:00:00Z" },
      ])
    ).toBe(false)
  })

  it("faltou e depois visitou → não entra", () => {
    expect(
      deveReengajarNoShow([
        { status: "no_show", scheduled_at: "2026-08-14T13:00:00Z" },
        { status: "completed", scheduled_at: "2026-08-18T13:00:00Z" },
      ])
    ).toBe(false)
  })

  it("visitou antes e faltou depois → entra (quem manda é o mais recente)", () => {
    expect(
      deveReengajarNoShow([
        { status: "completed", scheduled_at: "2026-07-10T13:00:00Z" },
        { status: "no_show", scheduled_at: "2026-08-14T13:00:00Z" },
      ])
    ).toBe(true)
  })

  it("agendamento cancelado depois do no-show não apaga o no-show", () => {
    // Cancelamento é do agendamento, não da falta: o mais recente é o cancelado,
    // então NÃO entra. Documenta a escolha em vez de deixá-la implícita.
    expect(
      deveReengajarNoShow([
        { status: "no_show", scheduled_at: "2026-08-14T13:00:00Z" },
        { status: "cancelled", scheduled_at: "2026-08-20T13:00:00Z" },
      ])
    ).toBe(false)
  })

  it("data inválida/ausente não vira o mais recente", () => {
    expect(
      deveReengajarNoShow([
        { status: "no_show", scheduled_at: "2026-08-14T13:00:00Z" },
        { status: "scheduled", scheduled_at: null },
      ])
    ).toBe(true)
    expect(deveReengajarNoShow([{ status: "no_show", scheduled_at: null }])).toBe(false)
  })

  it("aceita Date além de string", () => {
    expect(
      deveReengajarNoShow([{ status: "no_show", scheduled_at: new Date("2026-08-14T13:00:00Z") }])
    ).toBe(true)
  })
})
