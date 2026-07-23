import { describe, it, expect } from "vitest"
import { imobSlotsForDay, isValidImobSlot, buildDayOptions } from "./imob-slots"
import type { WeekSchedule } from "@web/lib/roleta/business-time"

// Agenda: seg-sex 08:00-18:00; sáb 08:00-12:00; dom fechado.
const WEEK: WeekSchedule = [
  { isOpen: false, open: "08:00", close: "18:00" }, // dom
  { isOpen: true, open: "08:00", close: "18:00" },
  { isOpen: true, open: "08:00", close: "18:00" },
  { isOpen: true, open: "08:00", close: "18:00" },
  { isOpen: true, open: "08:00", close: "18:00" },
  { isOpen: true, open: "08:00", close: "18:00" },
  { isOpen: true, open: "08:00", close: "12:00" }, // sáb
]
const TZ = "America/Sao_Paulo"
// Segunda 2026-07-20; "agora" = domingo 19/07 à noite (nenhum slot passado).
const NOW = new Date("2026-07-19T22:00:00Z")
const DAY = { y: 2026, mo: 7, d: 20 }

describe("imobSlotsForDay (Story 81-4 → 81-9; passo de 30min desde 2026-07-23)", () => {
  it("dia útil sem ocupação → grade 08:00..17:00 de 30 em 30, todos livres", () => {
    const slots = imobSlotsForDay({ ...DAY, week: WEEK, timezone: TZ, busy: [], now: NOW })
    expect(slots).toHaveLength(19) // 08:00, 08:30, …, 17:00 (17:30 não cabe: 18:30 > 18:00)
    expect(slots[0]?.labelLocal).toBe("08:00")
    expect(slots[1]?.labelLocal).toBe("08:30")
    expect(slots.at(-1)?.labelLocal).toBe("17:00")
    expect(slots.every((s) => s.free)).toBe(true)
  })

  it("domingo (fechado) → sem slots", () => {
    const slots = imobSlotsForDay({ y: 2026, mo: 7, d: 19, week: WEEK, timezone: TZ, busy: [], now: NOW })
    expect(slots).toHaveLength(0)
  })

  it("compromisso ativo da equipe ocupa TODO slot que sobrepõe, em QUALQUER local (81-9)", () => {
    // 14:00 BRT = 17:00Z — visita de 1h bloqueia 13:30, 14:00 e 14:30 (sobreposição parcial)
    const busy = [{ scheduled_at: "2026-07-20T17:00:00.000Z", duration_minutes: 60 }]
    const slots = imobSlotsForDay({ ...DAY, week: WEEK, timezone: TZ, busy, now: NOW })
    expect(slots.find((s) => s.labelLocal === "13:00")?.free).toBe(true)
    expect(slots.find((s) => s.labelLocal === "13:30")?.free).toBe(false) // 13:30-14:30 × 14:00-15:00
    expect(slots.find((s) => s.labelLocal === "14:00")?.free).toBe(false)
    expect(slots.find((s) => s.labelLocal === "14:30")?.free).toBe(false) // 14:30-15:30 × 14:00-15:00
    expect(slots.find((s) => s.labelLocal === "15:00")?.free).toBe(true)
  })

  it("visita começando em meia hora bloqueia as vizinhas por sobreposição", () => {
    // 14:30 BRT = 17:30Z
    const busy = [{ scheduled_at: "2026-07-20T17:30:00.000Z", duration_minutes: 60 }]
    const slots = imobSlotsForDay({ ...DAY, week: WEEK, timezone: TZ, busy, now: NOW })
    expect(slots.find((s) => s.labelLocal === "14:00")?.free).toBe(false)
    expect(slots.find((s) => s.labelLocal === "14:30")?.free).toBe(false)
    expect(slots.find((s) => s.labelLocal === "15:00")?.free).toBe(false)
    expect(slots.find((s) => s.labelLocal === "13:30")?.free).toBe(true)
    expect(slots.find((s) => s.labelLocal === "15:30")?.free).toBe(true)
  })

  it("slots já passados não são oferecidos", () => {
    const midday = new Date("2026-07-20T15:30:00Z") // 12:30 BRT
    const slots = imobSlotsForDay({ ...DAY, week: WEEK, timezone: TZ, busy: [], now: midday })
    expect(slots[0]?.labelLocal).toBe("13:00")
  })

  it("sábado usa a janela do sábado (último início 11:00 — a visita cabe até 12:00)", () => {
    const slots = imobSlotsForDay({ y: 2026, mo: 7, d: 25, week: WEEK, timezone: TZ, busy: [], now: NOW })
    expect(slots[0]?.labelLocal).toBe("08:00")
    expect(slots.at(-1)?.labelLocal).toBe("11:00") // 11:30 não cabe (terminaria 12:30)
  })
})

describe("buildDayOptions (Story 81-8)", () => {
  it("gera até 14 dias pulando os fechados (domingo fora)", () => {
    const days = buildDayOptions(TZ, WEEK, NOW)
    expect(days.length).toBeGreaterThan(0)
    expect(days.length).toBeLessThanOrEqual(14)
    // domingo 2026-07-26 não aparece (WEEK[0].isOpen = false)
    expect(days.some((d) => d.date === "2026-07-26")).toBe(false)
    // formato YYYY-MM-DD e label pt-BR
    expect(days[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(days[0]?.label.length).toBeGreaterThan(3)
  })
})

describe("isValidImobSlot (Story 81-4; passo de 30min)", () => {
  it("hora cheia dentro do expediente = válido", () => {
    expect(isValidImobSlot(new Date("2026-07-20T17:00:00Z"), WEEK, TZ)).toBe(true) // seg 14:00 BRT
  })
  it("meia hora = válido (passo de 30min)", () => {
    expect(isValidImobSlot(new Date("2026-07-20T17:30:00Z"), WEEK, TZ)).toBe(true) // seg 14:30 BRT
  })
  it("minuto quebrado (não alinhado a :00/:30) = inválido", () => {
    expect(isValidImobSlot(new Date("2026-07-20T17:15:00Z"), WEEK, TZ)).toBe(false) // seg 14:15 BRT
  })
  it("fora do expediente / dia fechado = inválido", () => {
    expect(isValidImobSlot(new Date("2026-07-20T23:00:00Z"), WEEK, TZ)).toBe(false) // seg 20:00 BRT
    expect(isValidImobSlot(new Date("2026-07-19T17:00:00Z"), WEEK, TZ)).toBe(false) // domingo
  })
  it("último início válido é 1h antes do fechamento; depois disso não", () => {
    expect(isValidImobSlot(new Date("2026-07-20T20:00:00Z"), WEEK, TZ)).toBe(true) // 17:00 BRT
    expect(isValidImobSlot(new Date("2026-07-20T20:30:00Z"), WEEK, TZ)).toBe(false) // 17:30 BRT (terminaria 18:30)
    expect(isValidImobSlot(new Date("2026-07-20T21:00:00Z"), WEEK, TZ)).toBe(false) // 18:00 BRT
  })
})
