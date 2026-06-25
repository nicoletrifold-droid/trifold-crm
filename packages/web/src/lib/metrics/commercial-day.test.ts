import { describe, it, expect } from "vitest"
import { commercialDayRange, previousCommercialDayRange } from "./commercial-day"

// Servidor roda em America/Sao_Paulo; os testes assumem o mesmo TZ do processo
// (vitest herda o TZ do ambiente). Construímos datas locais via componentes.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0)

describe("commercialDayRange (close 20:00)", () => {
  it("21:00 → dia comercial vai do fechamento de hoje ao de amanhã (lead conta amanhã)", () => {
    const { from, to } = commercialDayRange(at(2026, 6, 24, 21, 0), "20:00")
    expect(from).toEqual(at(2026, 6, 24, 20, 0))
    expect(to).toEqual(at(2026, 6, 25, 20, 0))
  })

  it("02:00 (madrugada) → conta no dia comercial atual [fechamento de ontem, fechamento de hoje)", () => {
    const { from, to } = commercialDayRange(at(2026, 6, 25, 2, 0), "20:00")
    expect(from).toEqual(at(2026, 6, 24, 20, 0))
    expect(to).toEqual(at(2026, 6, 25, 20, 0))
  })

  it("14:00 → [fechamento de ontem, fechamento de hoje)", () => {
    const { from, to } = commercialDayRange(at(2026, 6, 25, 14, 0), "20:00")
    expect(from).toEqual(at(2026, 6, 24, 20, 0))
    expect(to).toEqual(at(2026, 6, 25, 20, 0))
  })

  it("19:59 ainda é o dia comercial atual; 20:00 já vira o próximo", () => {
    const before = commercialDayRange(at(2026, 6, 25, 19, 59), "20:00")
    expect(before.from).toEqual(at(2026, 6, 24, 20, 0))
    expect(before.to).toEqual(at(2026, 6, 25, 20, 0))

    const atClose = commercialDayRange(at(2026, 6, 25, 20, 0), "20:00")
    expect(atClose.from).toEqual(at(2026, 6, 25, 20, 0))
    expect(atClose.to).toEqual(at(2026, 6, 26, 20, 0))
  })

  it("respeita um fechamento diferente (ex.: 18:00)", () => {
    const { from, to } = commercialDayRange(at(2026, 6, 25, 19, 0), "18:00")
    expect(from).toEqual(at(2026, 6, 25, 18, 0))
    expect(to).toEqual(at(2026, 6, 26, 18, 0))
  })

  it("aceita formato HH:MM:SS e entrada inválida cai no fallback 20:00", () => {
    expect(commercialDayRange(at(2026, 6, 25, 14, 0), "20:00:00").from).toEqual(at(2026, 6, 24, 20, 0))
    expect(commercialDayRange(at(2026, 6, 25, 14, 0), "").from).toEqual(at(2026, 6, 24, 20, 0))
  })

  it("to é exclusivo (limite superior usa < to)", () => {
    const { to } = commercialDayRange(at(2026, 6, 25, 14, 0), "20:00")
    // um lead exatamente no fechamento pertence ao PRÓXIMO dia comercial
    const leadAtClose = at(2026, 6, 25, 20, 0)
    expect(leadAtClose.getTime() < to.getTime()).toBe(false)
  })
})

describe("previousCommercialDayRange", () => {
  it("às 07:59 reporta o último dia comercial fechado [fechamento de anteontem, fechamento de ontem)", () => {
    const { from, to } = previousCommercialDayRange(at(2026, 6, 25, 7, 59), "20:00")
    expect(from).toEqual(at(2026, 6, 23, 20, 0))
    expect(to).toEqual(at(2026, 6, 24, 20, 0))
  })

  it("o fim do dia anterior encosta no início do dia atual (sem buraco/sobreposição)", () => {
    const now = at(2026, 6, 25, 7, 59)
    const prev = previousCommercialDayRange(now, "20:00")
    const curr = commercialDayRange(now, "20:00")
    expect(prev.to).toEqual(curr.from)
  })
})
