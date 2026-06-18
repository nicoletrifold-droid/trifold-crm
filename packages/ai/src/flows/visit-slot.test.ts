import { describe, it, expect } from "vitest"
import { parseRequestedSlot } from "./visit-slot"

// Âncora: 2026-06-18T17:00:00Z = quinta-feira 14:00 em BRT (UTC-3).
const NOW = new Date("2026-06-18T17:00:00Z")

describe("parseRequestedSlot", () => {
  it("dia + hora explícitos dentro do horário → startUtc", () => {
    const s = parseRequestedSlot("pode ser quinta às 15h", NOW)
    expect(s.hasDay).toBe(true)
    expect(s.hasTime).toBe(true)
    expect(s.outsideHours).toBe(false)
    expect(s.startUtc?.toISOString()).toBe("2026-06-18T18:00:00.000Z") // 15h BRT
  })

  it("amanhã às 10h → próximo dia 10h BRT", () => {
    const s = parseRequestedSlot("amanhã às 10h fica bom", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-19T13:00:00.000Z")
  })

  it("meio-dia de amanhã → 12h BRT", () => {
    const s = parseRequestedSlot("pode ser meio-dia de amanhã", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-19T15:00:00.000Z")
  })

  it("sábado às 11h → válido (sábado fecha 12h)", () => {
    const s = parseRequestedSlot("sábado às 11h", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-20T14:00:00.000Z")
  })

  it("domingo → fora do horário (fechado)", () => {
    const s = parseRequestedSlot("domingo às 10h", NOW)
    expect(s.hasDay).toBe(true)
    expect(s.outsideHours).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("quinta às 20h → fora do horário comercial", () => {
    const s = parseRequestedSlot("quinta às 20h", NOW)
    expect(s.outsideHours).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("sexta às 7h → antes da abertura", () => {
    const s = parseRequestedSlot("sexta às 7h", NOW)
    expect(s.outsideHours).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("sábado às 13h → após o fechamento de sábado", () => {
    const s = parseRequestedSlot("sábado às 13h", NOW)
    expect(s.outsideHours).toBe(true)
  })

  it("só o dia, sem horário → hasDay sem startUtc", () => {
    const s = parseRequestedSlot("pode ser quinta", NOW)
    expect(s.hasDay).toBe(true)
    expect(s.hasTime).toBe(false)
    expect(s.startUtc).toBeNull()
  })

  it("só o horário, sem dia → hasTime sem startUtc", () => {
    const s = parseRequestedSlot("às 15h", NOW)
    expect(s.hasDay).toBe(false)
    expect(s.hasTime).toBe(true)
    expect(s.startUtc).toBeNull()
  })

  it("horário no passado (hoje 10h, já são 14h) → não vira slot", () => {
    const s = parseRequestedSlot("hoje às 10h", NOW)
    expect(s.startUtc).toBeNull()
    expect(s.outsideHours).toBe(false)
  })

  it("hoje à tarde futuro → válido", () => {
    const s = parseRequestedSlot("hoje às 16h", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-18T19:00:00.000Z")
  })

  it("não confunde 'ter' em 'gostaria de ter' com terça", () => {
    const s = parseRequestedSlot("gostaria de ter mais informações", NOW)
    expect(s.hasDay).toBe(false)
  })

  it("não confunde '2 suítes' com horário", () => {
    const s = parseRequestedSlot("quero 2 suítes", NOW)
    expect(s.hasTime).toBe(false)
  })

  it("'3 da tarde' → 15h BRT", () => {
    const s = parseRequestedSlot("quinta às 3 da tarde", NOW)
    expect(s.startUtc?.toISOString()).toBe("2026-06-18T18:00:00.000Z")
  })
})
