import { describe, it, expect } from "vitest"
import { formatRelativeTime } from "../format-relative-time"

// Datas construídas com o construtor LOCAL (ano, mêsIndex, dia, hora, min) para
// que getHours/getDay sejam determinísticos independentemente do timezone do CI.

describe("formatRelativeTime", () => {
  it("mesmo dia (manhã) → HH:mm", () => {
    const now = new Date(2026, 5, 22, 15, 0) // 22/06/2026 15:00 (seg)
    const date = new Date(2026, 5, 22, 9, 5)
    expect(formatRelativeTime(date, now)).toBe("09:05")
  })

  it("mesmo dia (tarde) → HH:mm", () => {
    const now = new Date(2026, 5, 22, 20, 0)
    const date = new Date(2026, 5, 22, 14, 32)
    expect(formatRelativeTime(date, now)).toBe("14:32")
  })

  it("dia anterior → 'Ontem'", () => {
    const now = new Date(2026, 5, 22, 8, 0)
    const date = new Date(2026, 5, 21, 23, 50)
    expect(formatRelativeTime(date, now)).toBe("Ontem")
  })

  it("3 dias atrás → nome curto do dia da semana", () => {
    const now = new Date(2026, 5, 22, 10, 0) // segunda
    const date = new Date(2026, 5, 19, 10, 0) // sexta-feira
    expect(formatRelativeTime(date, now)).toBe("Sex")
  })

  it("6 dias atrás → nome curto do dia da semana (limite superior)", () => {
    const now = new Date(2026, 5, 22, 10, 0) // segunda
    const date = new Date(2026, 5, 16, 10, 0) // terça-feira
    expect(formatRelativeTime(date, now)).toBe("Ter")
  })

  it("8 dias atrás → dd/MM/aa", () => {
    const now = new Date(2026, 5, 22, 10, 0)
    const date = new Date(2026, 5, 14, 10, 0)
    expect(formatRelativeTime(date, now)).toBe("14/06/26")
  })

  it("7 dias atrás → dd/MM/aa (limite inferior da data curta)", () => {
    const now = new Date(2026, 5, 22, 10, 0)
    const date = new Date(2026, 5, 15, 10, 0)
    expect(formatRelativeTime(date, now)).toBe("15/06/26")
  })

  it("data futura no mesmo dia → HH:mm", () => {
    const now = new Date(2026, 5, 22, 9, 0)
    const date = new Date(2026, 5, 22, 18, 45)
    expect(formatRelativeTime(date, now)).toBe("18:45")
  })

  it("ano de virada → dd/MM/aa com ano de 2 dígitos", () => {
    const now = new Date(2026, 0, 5, 10, 0)
    const date = new Date(2025, 11, 25, 10, 0) // 25/12/25
    expect(formatRelativeTime(date, now)).toBe("25/12/25")
  })
})
