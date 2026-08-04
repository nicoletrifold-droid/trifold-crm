import { describe, it, expect } from "vitest"
import { getWindowStatus, formatCountdown } from "./window-status"

const HOUR = 60 * 60 * 1000
const NOW = new Date("2026-06-18T12:00:00.000Z")

describe("getWindowStatus", () => {
  it("sem histórico (null) → janela fechada, label convida à abertura (75-267)", () => {
    const s = getWindowStatus(null, true, NOW)
    expect(s.status).toBe("closed")
    expect(s.remainingMs).toBe(0)
    expect(s.label).toBe("Sem conversa · inicie o atendimento")
  })

  it("última mensagem há 1h → aberta, restante ~23h", () => {
    const s = getWindowStatus(new Date(NOW.getTime() - 1 * HOUR), true, NOW)
    expect(s.status).toBe("open")
    expect(s.remainingMs).toBe(23 * HOUR)
  })

  it("última mensagem há 23h → fechando, restante ~1h", () => {
    const s = getWindowStatus(new Date(NOW.getTime() - 23 * HOUR), true, NOW)
    expect(s.status).toBe("closing")
    expect(s.remainingMs).toBe(1 * HOUR)
  })

  it("limiar exato de 22h → fechando", () => {
    const s = getWindowStatus(new Date(NOW.getTime() - 22 * HOUR), true, NOW)
    expect(s.status).toBe("closing")
  })

  it("última mensagem há 25h → fechada, restante 0, label original (AC7 75-267)", () => {
    const s = getWindowStatus(new Date(NOW.getTime() - 25 * HOUR), true, NOW)
    expect(s.status).toBe("closed")
    expect(s.remainingMs).toBe(0)
    expect(s.label).toBe("Janela fechada · aguardando o lead")
  })

  it("Telegram (isWhatsApp=false) → sempre aberta, sem label", () => {
    const s = getWindowStatus(new Date(NOW.getTime() - 100 * HOUR), false, NOW)
    expect(s.status).toBe("open")
    expect(s.label).toBe("")
    expect(s.remainingMs).toBe(Infinity)
  })
})

describe("formatCountdown", () => {
  it("7200000ms → '2h 0m'", () => {
    expect(formatCountdown(7200000)).toBe("2h 0m")
  })

  it("5400000ms → '1h 30m'", () => {
    expect(formatCountdown(5400000)).toBe("1h 30m")
  })

  it("> 24h formata corretamente (90000000ms → '25h 0m')", () => {
    expect(formatCountdown(90000000)).toBe("25h 0m")
  })

  it("valor ≤ 0 ou não-finito → '0h 0m'", () => {
    expect(formatCountdown(0)).toBe("0h 0m")
    expect(formatCountdown(-100)).toBe("0h 0m")
    expect(formatCountdown(Infinity)).toBe("0h 0m")
  })
})
