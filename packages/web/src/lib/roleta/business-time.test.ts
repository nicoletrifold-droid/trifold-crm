import { describe, it, expect } from "vitest"
import { businessMinutesBetween, isWithinBusinessHoursNow, type BusinessHoursCfg } from "./business-time"

// Todos os dias, 08:00–20:00, America/Sao_Paulo (UTC-3, sem horário de verão em 2026)
const CFG: BusinessHoursCfg = {
  business_days: [0, 1, 2, 3, 4, 5, 6],
  business_hour_start: "08:00:00",
  business_hour_end: "20:00:00",
  weekend_hour_start: "08:00",
  weekend_hour_end: "20:00",
  timezone: "America/Sao_Paulo",
}

// Só dias úteis (seg–sex)
const CFG_WK: BusinessHoursCfg = { ...CFG, business_days: [1, 2, 3, 4, 5] }

describe("businessMinutesBetween", () => {
  it("dentro do expediente, mesmo dia → diferença direta", () => {
    // 10:00 → 10:30 BRT
    const r = businessMinutesBetween(new Date("2026-06-24T13:00:00Z"), new Date("2026-06-24T13:30:00Z"), CFG)
    expect(r).toBe(30)
  })

  it("começa antes da abertura → conta a partir das 08:00", () => {
    // 07:00 → 08:30 BRT (abre 08:00) = 30 min
    const r = businessMinutesBetween(new Date("2026-06-24T10:00:00Z"), new Date("2026-06-24T11:30:00Z"), CFG)
    expect(r).toBe(30)
  })

  it("atravessa a noite → soma só os trechos de expediente (pausa)", () => {
    // 19:50 (10 min até fechar 20:00) + dia seguinte 08:00–08:20 (20 min) = 30
    const r = businessMinutesBetween(new Date("2026-06-24T22:50:00Z"), new Date("2026-06-25T11:20:00Z"), CFG)
    expect(r).toBe(30)
  })

  it("totalmente fora do expediente → 0", () => {
    // 00:00 → 02:00 BRT (madrugada)
    const r = businessMinutesBetween(new Date("2026-06-25T03:00:00Z"), new Date("2026-06-25T05:00:00Z"), CFG)
    expect(r).toBe(0)
  })

  it("to <= from → 0", () => {
    expect(businessMinutesBetween(new Date("2026-06-24T13:30:00Z"), new Date("2026-06-24T13:00:00Z"), CFG)).toBe(0)
  })

  it("pula fim de semana quando não é dia útil (sex→seg)", () => {
    // Sex 19:50 (10) + Sáb/Dom pulados + Seg 08:00–08:20 (20) = 30
    const r = businessMinutesBetween(new Date("2026-06-26T22:50:00Z"), new Date("2026-06-29T11:20:00Z"), CFG_WK)
    expect(r).toBe(30)
  })
})

describe("isWithinBusinessHoursNow", () => {
  it("10:00 BRT em dia útil → true", () => {
    expect(isWithinBusinessHoursNow(CFG, new Date("2026-06-24T13:00:00Z"))).toBe(true)
  })
  it("00:00 BRT → false", () => {
    expect(isWithinBusinessHoursNow(CFG, new Date("2026-06-25T03:00:00Z"))).toBe(false)
  })
  it("sábado com config só dias úteis → false", () => {
    expect(isWithinBusinessHoursNow(CFG_WK, new Date("2026-06-27T13:00:00Z"))).toBe(false)
  })
})
