/**
 * Story 75-177 — Tests para decideStaleAppointment.
 *
 * Cobre os 4 caminhos:
 *  1. lead em etapa pós-visita           → "complete" (guard 1)
 *  2. atividade do corretor após visita  → "complete" (guard 2)
 *  3. lead terminal/parqueado            → "cancel"   (guard bônus)
 *  4. nenhum sinal (no-show real)        → "no_show"  (AC4, comportamento atual)
 */
import { describe, it, expect } from "vitest"
import { STAGE_IDS } from "@trifold/shared"
import { decideStaleAppointment } from "./no-show-decision"

const SCHEDULED = "2026-07-18T14:00:00.000Z"
const BEFORE = "2026-07-18T09:00:00.000Z" // antes da visita
const AFTER = "2026-07-18T17:00:00.000Z" // depois da visita

describe("decideStaleAppointment (Story 75-177)", () => {
  it("guard 1: lead já em Visitou → complete (não reverte)", () => {
    expect(
      decideStaleAppointment({ leadStageId: STAGE_IDS.visitou, scheduledAt: SCHEDULED })
    ).toBe("complete")
  })

  it("guard 1: demais etapas pós-visita (proposta/negociando/fechou) → complete", () => {
    for (const stage of [STAGE_IDS.proposta, STAGE_IDS.negociando, STAGE_IDS.fechou]) {
      expect(decideStaleAppointment({ leadStageId: stage, scheduledAt: SCHEDULED })).toBe("complete")
    }
  })

  it("guard 2: atividade do corretor DEPOIS do horário agendado → complete", () => {
    expect(
      decideStaleAppointment({
        leadStageId: STAGE_IDS.visita_agendada,
        scheduledAt: SCHEDULED,
        latestBrokerActivityAt: AFTER,
      })
    ).toBe("complete")
  })

  it("guard 2: atividade do corretor ANTES da visita não conta → no_show", () => {
    expect(
      decideStaleAppointment({
        leadStageId: STAGE_IDS.visita_agendada,
        scheduledAt: SCHEDULED,
        latestBrokerActivityAt: BEFORE,
      })
    ).toBe("no_show")
  })

  it("guard bônus: lead Perdido nunca é ressuscitado → cancel", () => {
    expect(
      decideStaleAppointment({ leadStageId: STAGE_IDS.perdido, scheduledAt: SCHEDULED })
    ).toBe("cancel")
  })

  it("guard bônus: lead em Represamento (parqueado) → cancel", () => {
    expect(
      decideStaleAppointment({ leadStageId: STAGE_IDS.represamento, scheduledAt: SCHEDULED })
    ).toBe("cancel")
  })

  it("terminal tem precedência sobre atividade posterior (perdido + nota depois) → cancel", () => {
    expect(
      decideStaleAppointment({
        leadStageId: STAGE_IDS.perdido,
        scheduledAt: SCHEDULED,
        latestBrokerActivityAt: AFTER,
      })
    ).toBe("cancel")
  })

  it("AC4: no-show real — lead em Visita Agendada, sem atividade → no_show", () => {
    expect(
      decideStaleAppointment({
        leadStageId: STAGE_IDS.visita_agendada,
        scheduledAt: SCHEDULED,
        latestBrokerActivityAt: null,
      })
    ).toBe("no_show")
  })

  it("robustez: stage nulo/indefinido e sem atividade → no_show", () => {
    expect(decideStaleAppointment({ leadStageId: null, scheduledAt: SCHEDULED })).toBe("no_show")
    expect(decideStaleAppointment({ leadStageId: undefined, scheduledAt: SCHEDULED })).toBe("no_show")
  })

  it("robustez: timestamp de atividade inválido é ignorado → no_show", () => {
    expect(
      decideStaleAppointment({
        leadStageId: STAGE_IDS.visita_agendada,
        scheduledAt: SCHEDULED,
        latestBrokerActivityAt: "não-é-data",
      })
    ).toBe("no_show")
  })
})
