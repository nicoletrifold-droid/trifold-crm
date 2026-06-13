import { describe, it, expect } from "vitest"
import { hasConfirmedDay, resolveOffHoursResponse } from "./pipeline"
import { OFF_HOURS_PROMPT } from "../prompts"

describe("hasConfirmedDay", () => {
  // Day names — should return true
  it("matches sábado", () => {
    expect(hasConfirmedDay("sábado às 10h")).toBe(true)
  })

  it("matches sabado (no accent)", () => {
    expect(hasConfirmedDay("pode ser sabado")).toBe(true)
  })

  it("matches segunda-feira", () => {
    expect(hasConfirmedDay("segunda-feira que vem")).toBe(true)
  })

  it("matches amanhã", () => {
    expect(hasConfirmedDay("posso amanhã de manhã")).toBe(true)
  })

  it("matches hoje", () => {
    expect(hasConfirmedDay("posso hoje à tarde")).toBe(true)
  })

  it("matches date format dd/mm", () => {
    expect(hasConfirmedDay("dia 15/04 funciona")).toBe(true)
  })

  it("matches semana que vem", () => {
    expect(hasConfirmedDay("semana que vem tá bom")).toBe(true)
  })

  it("matches próxima semana", () => {
    expect(hasConfirmedDay("próxima semana")).toBe(true)
  })

  it("matches próximo sábado", () => {
    expect(hasConfirmedDay("próximo sábado")).toBe(true)
  })

  // Intent phrases — should return true
  it("matches quero visitar", () => {
    expect(hasConfirmedDay("quero visitar o apartamento")).toBe(true)
  })

  it("matches posso ir", () => {
    expect(hasConfirmedDay("posso ir ver")).toBe(true)
  })

  it("matches vou aí", () => {
    expect(hasConfirmedDay("vou aí amanhã")).toBe(true)
  })

  // Time-only — should return false
  it("rejects time-only '10h'", () => {
    expect(hasConfirmedDay("pode ser às 10h")).toBe(false)
  })

  it("rejects time-only 'de manhã'", () => {
    expect(hasConfirmedDay("prefiro de manhã")).toBe(false)
  })

  it("rejects time-only 'à tarde'", () => {
    expect(hasConfirmedDay("melhor à tarde")).toBe(false)
  })

  // False positive guards — should return false
  it("rejects 'segunda opção' (not segunda-feira)", () => {
    expect(hasConfirmedDay("gostaria da segunda opção de planta")).toBe(false)
  })

  it("rejects 'próximo passo' (not próxima semana)", () => {
    expect(hasConfirmedDay("qual o próximo passo?")).toBe(false)
  })

  // Edge cases
  it("returns false for null", () => {
    expect(hasConfirmedDay(null)).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(hasConfirmedDay("")).toBe(false)
  })

  it("returns false for number", () => {
    expect(hasConfirmedDay(123)).toBe(false)
  })
})

describe("resolveOffHoursResponse — off-hours message (Story 53-1)", () => {
  it("uses the DB out_of_hours_message when it is filled", () => {
    const custom = "Estamos fechados, mas deixe seu recado que retornamos amanhã!"
    expect(resolveOffHoursResponse({ out_of_hours_message: custom })).toBe(custom)
  })

  it("falls back to OFF_HOURS_PROMPT when out_of_hours_message is null", () => {
    expect(resolveOffHoursResponse({ out_of_hours_message: null })).toBe(OFF_HOURS_PROMPT)
  })

  it("falls back to OFF_HOURS_PROMPT when out_of_hours_message is undefined", () => {
    expect(resolveOffHoursResponse({})).toBe(OFF_HOURS_PROMPT)
  })

  it("falls back to OFF_HOURS_PROMPT when out_of_hours_message is empty/whitespace", () => {
    expect(resolveOffHoursResponse({ out_of_hours_message: "   " })).toBe(OFF_HOURS_PROMPT)
  })

  it("trims the DB value before returning", () => {
    expect(resolveOffHoursResponse({ out_of_hours_message: "  Olá!  " })).toBe("Olá!")
  })
})
