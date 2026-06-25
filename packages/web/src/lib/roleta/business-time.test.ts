import { describe, it, expect } from "vitest"
import {
  businessMinutesBetween,
  isWithinBusinessHoursNow,
  commercialDayRange,
  previousCommercialDayRange,
  isOpenAtNow,
  deriveScheduleFromConfig,
  type BusinessHoursCfg,
  type WeekSchedule,
} from "./business-time"

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

// ─────────────────── Agenda por dia da semana (Story 75-58) ───────────────────
// 2026: 25/06=Qui, 26=Sex, 27=Sáb, 28=Dom, 29=Seg. TZ America/Sao_Paulo (UTC-3).
const TZ = "America/Sao_Paulo"
const open = (o = "08:00", c = "20:00") => ({ isOpen: true, open: o, close: c })
const ALL: WeekSchedule = Array.from({ length: 7 }, () => open())
const SAT_SHORT: WeekSchedule = [
  { isOpen: false, open: "08:00", close: "20:00" }, // 0 Dom fechado
  open(), open(), open(), open(), open(),           // 1–5 Seg–Sex 08–20
  open("09:00", "14:00"),                           // 6 Sáb 09–14
]

describe("commercialDayRange — todos os dias 08–20", () => {
  it("Qui 08:00 → [Qua 20:00, Qui 20:00)", () => {
    const r = commercialDayRange(new Date("2026-06-25T11:00:00Z"), ALL, TZ)
    expect(r.from.toISOString()).toBe("2026-06-24T23:00:00.000Z")
    expect(r.to.toISOString()).toBe("2026-06-25T23:00:00.000Z")
  })
  it("Qui 21:00 (após fechar) → próximo balde [Qui 20:00, Sex 20:00)", () => {
    const r = commercialDayRange(new Date("2026-06-26T00:00:00Z"), ALL, TZ)
    expect(r.from.toISOString()).toBe("2026-06-25T23:00:00.000Z")
    expect(r.to.toISOString()).toBe("2026-06-26T23:00:00.000Z")
  })
})

describe("commercialDayRange — Sáb 09–14, Dom fechado", () => {
  it("Dom 10:00 → rola pra Segunda [Sáb 14:00, Seg 20:00)", () => {
    const r = commercialDayRange(new Date("2026-06-28T13:00:00Z"), SAT_SHORT, TZ)
    expect(r.from.toISOString()).toBe("2026-06-27T17:00:00.000Z") // Sáb 14:00 BRT
    expect(r.to.toISOString()).toBe("2026-06-29T23:00:00.000Z")   // Seg 20:00 BRT
  })
  it("Sáb 15:00 (após fechar 14:00) → conta na Segunda", () => {
    const r = commercialDayRange(new Date("2026-06-27T18:00:00Z"), SAT_SHORT, TZ)
    expect(r.from.toISOString()).toBe("2026-06-27T17:00:00.000Z")
    expect(r.to.toISOString()).toBe("2026-06-29T23:00:00.000Z")
  })
  it("Sáb 11:00 → conta no Sábado [Sex 20:00, Sáb 14:00)", () => {
    const r = commercialDayRange(new Date("2026-06-27T14:00:00Z"), SAT_SHORT, TZ)
    expect(r.from.toISOString()).toBe("2026-06-26T23:00:00.000Z") // Sex 20:00 BRT
    expect(r.to.toISOString()).toBe("2026-06-27T17:00:00.000Z")   // Sáb 14:00 BRT
  })
})

describe("previousCommercialDayRange", () => {
  it("Qui 07:59 → dia comercial anterior completo [Ter 20:00, Qua 20:00)", () => {
    const r = previousCommercialDayRange(new Date("2026-06-25T10:59:00Z"), ALL, TZ)
    expect(r.from.toISOString()).toBe("2026-06-23T23:00:00.000Z")
    expect(r.to.toISOString()).toBe("2026-06-24T23:00:00.000Z")
  })
})

describe("isOpenAtNow (agenda por dia)", () => {
  it("Qui 13:00 (08–20) → true", () => {
    expect(isOpenAtNow(new Date("2026-06-25T16:00:00Z"), ALL, TZ)).toBe(true)
  })
  it("Dom fechado → false", () => {
    expect(isOpenAtNow(new Date("2026-06-28T13:00:00Z"), SAT_SHORT, TZ)).toBe(false)
  })
  it("Sáb 11:00 (09–14) → true; Sáb 15:00 → false", () => {
    expect(isOpenAtNow(new Date("2026-06-27T14:00:00Z"), SAT_SHORT, TZ)).toBe(true)
    expect(isOpenAtNow(new Date("2026-06-27T18:00:00Z"), SAT_SHORT, TZ)).toBe(false)
  })
})

describe("deriveScheduleFromConfig", () => {
  it("config só dias úteis → fim de semana fechado, úteis 08–20", () => {
    const wk = deriveScheduleFromConfig(CFG_WK)
    expect(wk[0]?.isOpen).toBe(false) // Dom
    expect(wk[6]?.isOpen).toBe(false) // Sáb
    expect(wk[1]).toEqual({ isOpen: true, open: "08:00", close: "20:00" })
  })
})
