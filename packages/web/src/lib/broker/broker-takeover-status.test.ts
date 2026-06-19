import { describe, it, expect } from "vitest"
import {
  brokerSentRecently,
  deriveBrokerActive,
  BROKER_WINDOW_MS,
  type TakeoverMessage,
} from "./broker-takeover-status"

const NOW = new Date("2026-06-18T12:00:00.000Z").getTime()
const HOUR = 60 * 60 * 1000

function msg(role: string, ageMs: number): TakeoverMessage {
  return { role, created_at: new Date(NOW - ageMs).toISOString() }
}

describe("brokerSentRecently", () => {
  it("sem mensagens → false", () => {
    expect(brokerSentRecently([], NOW)).toBe(false)
  })

  it("mensagem do corretor há 1h → true", () => {
    expect(brokerSentRecently([msg("broker", 1 * HOUR)], NOW)).toBe(true)
  })

  it("mensagem do corretor há 25h → false (fora da janela)", () => {
    expect(brokerSentRecently([msg("broker", 25 * HOUR)], NOW)).toBe(false)
  })

  it("limiar exato de 24h → false (não estritamente menor)", () => {
    expect(brokerSentRecently([msg("broker", BROKER_WINDOW_MS)], NOW)).toBe(false)
  })

  it("apenas mensagens de assistant/user → false", () => {
    expect(
      brokerSentRecently([msg("assistant", 1 * HOUR), msg("user", 2 * HOUR)], NOW)
    ).toBe(false)
  })

  it("mistura: broker recente entre outras → true", () => {
    expect(
      brokerSentRecently(
        [msg("assistant", 30 * HOUR), msg("broker", 2 * HOUR), msg("user", 1 * HOUR)],
        NOW
      )
    ).toBe(true)
  })
})

describe("deriveBrokerActive", () => {
  it("Estado A — sem msg do corretor + is_ai_active=true → false (Nicole atendendo)", () => {
    expect(deriveBrokerActive([msg("assistant", 1 * HOUR)], true, NOW)).toBe(false)
  })

  it("Estado A — lead novo sem mensagens + is_ai_active=true → false", () => {
    expect(deriveBrokerActive([], true, NOW)).toBe(false)
  })

  it("Estado B — corretor enviou hoje + is_ai_active=true (não mudou) → true", () => {
    expect(deriveBrokerActive([msg("broker", 2 * HOUR)], true, NOW)).toBe(true)
  })

  it("Estado B — handoff manual admin (is_ai_active=false), sem msg do corretor → true", () => {
    expect(deriveBrokerActive([msg("assistant", 1 * HOUR)], false, NOW)).toBe(true)
  })

  it("Estado B — handoff manual sem mensagens → true", () => {
    expect(deriveBrokerActive([], false, NOW)).toBe(true)
  })

  it("Estado A — corretor enviou há mais de 24h + is_ai_active=true → false (Nicole retomou)", () => {
    expect(deriveBrokerActive([msg("broker", 30 * HOUR)], true, NOW)).toBe(false)
  })
})
