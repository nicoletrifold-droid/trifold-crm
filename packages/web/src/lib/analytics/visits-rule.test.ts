/**
 * Story 75-322 — trava a regra única de "visita realizada".
 *
 * O defeito que originou a story não foi um cálculo errado: foram duas
 * implementações da mesma pergunta, escritas em arquivos diferentes, que
 * divergiram em silêncio (tela 3, PDF 4, mesma janela). Os testes abaixo cobrem os
 * dois status que o PDF contava a mais e o recorte de equipe que faltava lá.
 */
import { describe, it, expect } from "vitest"
import {
  ANALYTICS_APPOINTMENT_TEAM,
  applyRealizedVisitFilter,
  isRealizedVisit,
  REALIZED_VISIT_STATUS,
} from "./visits-rule"

describe("isRealizedVisit", () => {
  it("só `completed` conta como visita realizada", () => {
    expect(isRealizedVisit("completed")).toBe(true)
    for (const status of ["scheduled", "confirmed", "cancelled", "no_show", "closed"]) {
      expect(isRealizedVisit(status)).toBe(false)
    }
  })

  it("scheduled/confirmed não contam — eram o que o PDF somava a mais", () => {
    expect(isRealizedVisit("scheduled")).toBe(false)
    expect(isRealizedVisit("confirmed")).toBe(false)
  })
})

describe("applyRealizedVisitFilter", () => {
  it("aplica status E equipe — o PDF não filtrava equipe e trazia a agenda do IMOB", () => {
    const applied: Array<[string, string]> = []
    const fakeQuery = {
      eq(column: string, value: string) {
        applied.push([column, value])
        return this
      },
    }

    applyRealizedVisitFilter(fakeQuery)

    expect(applied).toEqual([
      ["status", REALIZED_VISIT_STATUS],
      ["team", ANALYTICS_APPOINTMENT_TEAM],
    ])
  })
})
