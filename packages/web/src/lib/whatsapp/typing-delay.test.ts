/**
 * Story 75-156 — Testes do atraso "humano" antes de a Nicole responder.
 */
import { describe, it, expect } from "vitest"
import { calculateTypingDelay, TYPING_CHAR_DELAY_CAP_MS } from "./typing-delay"

describe("calculateTypingDelay", () => {
  it("soma base (800–1200ms) + 25ms/char com random=0 (base mínima)", () => {
    // random=0 → base=800; texto de 10 chars → +250ms
    expect(calculateTypingDelay("0123456789", () => 0)).toBe(1050)
  })

  it("random=1 → base máxima (1200ms)", () => {
    // texto vazio → só base; 800 + 1*400 = 1200
    expect(calculateTypingDelay("", () => 1)).toBe(1200)
  })

  it("respeita o teto de 3s no componente por caractere", () => {
    const longText = "a".repeat(1000) // 1000*25 = 25000ms, deve saturar em 3000
    // random=0 → base=800; charDelay saturado=3000 → 3800
    expect(calculateTypingDelay(longText, () => 0)).toBe(800 + TYPING_CHAR_DELAY_CAP_MS)
  })

  it("nunca excede base(1200) + cap(3000) = 4200ms, mesmo com texto enorme", () => {
    const delay = calculateTypingDelay("x".repeat(5000), () => 1)
    expect(delay).toBeLessThanOrEqual(1200 + TYPING_CHAR_DELAY_CAP_MS)
  })

  it("trata texto null/undefined como comprimento 0 (sem throw)", () => {
    // @ts-expect-error — validando robustez em runtime
    expect(calculateTypingDelay(null, () => 0)).toBe(800)
    // @ts-expect-error — validando robustez em runtime
    expect(calculateTypingDelay(undefined, () => 0)).toBe(800)
  })
})
