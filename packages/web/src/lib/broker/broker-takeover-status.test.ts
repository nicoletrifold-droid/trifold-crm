import { describe, it, expect } from "vitest"
import {
  brokerSentRecently,
  deriveBrokerActive,
  shouldReactivateAi,
  resolveTakeoverAnchor,
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

  it("created_at inválido (NaN) não gera falso positivo → false", () => {
    // Robustez: new Date("garbage").getTime() === NaN; (now - NaN < WINDOW) === false.
    expect(
      brokerSentRecently([{ role: "broker", created_at: "not-a-date" }], NOW)
    ).toBe(false)
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

describe("shouldReactivateAi", () => {
  it("nunca houve msg do corretor (null) → true (Nicole reassume)", () => {
    expect(shouldReactivateAi(null, NOW)).toBe(true)
  })

  it("última msg do corretor há 25h → true (corretor inativo, reassume)", () => {
    expect(
      shouldReactivateAi(new Date(NOW - 25 * HOUR).toISOString(), NOW)
    ).toBe(true)
  })

  it("última msg do corretor há 2h → false (corretor ativo, Nicole silente)", () => {
    expect(
      shouldReactivateAi(new Date(NOW - 2 * HOUR).toISOString(), NOW)
    ).toBe(false)
  })

  it("limiar exato de 24h → true (espelho do < de brokerSentRecently)", () => {
    expect(
      shouldReactivateAi(new Date(NOW - BROKER_WINDOW_MS).toISOString(), NOW)
    ).toBe(true)
  })

  it("1ms antes de 24h → false (ainda dentro da janela do corretor)", () => {
    expect(
      shouldReactivateAi(new Date(NOW - (BROKER_WINDOW_MS - 1)).toISOString(), NOW)
    ).toBe(false)
  })

  it("created_at inválido (NaN) → false (conservador: mantém corretor no controle)", () => {
    expect(shouldReactivateAi("not-a-date", NOW)).toBe(false)
  })
})

describe("resolveTakeoverAnchor (Story 63-15)", () => {
  const handoff = new Date(NOW - 2 * HOUR).toISOString()
  const broker = new Date(NOW - 1 * HOUR).toISOString()

  it("ambos nulos → null", () => {
    expect(resolveTakeoverAnchor(null, null)).toBeNull()
  })

  it("só handoff_at (handoff por agendamento, sem msg de corretor) → handoff_at", () => {
    expect(resolveTakeoverAnchor(handoff, null)).toBe(handoff)
  })

  it("só lastBrokerAt → lastBrokerAt", () => {
    expect(resolveTakeoverAnchor(null, broker)).toBe(broker)
  })

  it("corretor respondeu depois do handoff → âncora = msg do corretor (mais recente)", () => {
    expect(resolveTakeoverAnchor(handoff, broker)).toBe(broker)
  })

  it("handoff mais recente que a última msg do corretor → âncora = handoff_at", () => {
    const older = new Date(NOW - 5 * HOUR).toISOString()
    expect(resolveTakeoverAnchor(handoff, older)).toBe(handoff)
  })

  it("timestamps iguais → handoff_at (>=)", () => {
    expect(resolveTakeoverAnchor(handoff, handoff)).toBe(handoff)
  })

  it("integração: handoff por agendamento há 2h → NÃO reativa (Nicole silente)", () => {
    const anchor = resolveTakeoverAnchor(handoff, null)
    expect(shouldReactivateAi(anchor, NOW)).toBe(false)
  })

  it("integração: handoff por agendamento há 25h sem corretor → reativa", () => {
    const old = new Date(NOW - 25 * HOUR).toISOString()
    const anchor = resolveTakeoverAnchor(old, null)
    expect(shouldReactivateAi(anchor, NOW)).toBe(true)
  })

  it("integração: agendamento há 30h mas corretor respondeu há 1h → NÃO reativa", () => {
    const oldHandoff = new Date(NOW - 30 * HOUR).toISOString()
    const anchor = resolveTakeoverAnchor(oldHandoff, broker)
    expect(shouldReactivateAi(anchor, NOW)).toBe(false)
  })
})
