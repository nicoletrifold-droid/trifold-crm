import { describe, it, expect } from "vitest"
import { marcoToTipo, brDateToIso } from "./log-financial-notification"

describe("marcoToTipo", () => {
  it("mapeia os marcos do cron para o tipo do log", () => {
    expect(marcoToTipo("venc_hoje")).toBe("vence_hoje")
    expect(marcoToTipo("atraso5")).toBe("atraso_5")
    expect(marcoToTipo("atraso15")).toBe("atraso_15")
  })
})

describe("brDateToIso", () => {
  it("converte dd/mm/yyyy para ISO", () => {
    expect(brDateToIso("10/07/2026")).toBe("2026-07-10")
    expect(brDateToIso("01/01/2027")).toBe("2027-01-01")
  })
  it("retorna null para entradas inválidas", () => {
    expect(brDateToIso("")).toBeNull()
    expect(brDateToIso(null)).toBeNull()
    expect(brDateToIso("2026-07-10")).toBeNull()
    expect(brDateToIso("hoje")).toBeNull()
  })
})
