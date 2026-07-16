/**
 * Story 51-2 (Epic 51) — Tests para a montagem do texto de transição.
 *
 * Cobre os cenários de texto obrigatórios (Testing 4–5 + fallback de nome):
 *  - leadName presente → "Olá {leadName}! Sou {brokerName}, ..."
 *  - leadName null/vazio → "Olá! Sou {brokerName}, ..." (sem nome do lead)
 *  - brokerName ausente → fallback gracioso "um corretor da equipe Trifold"
 *
 * A lógica de "1ª mensagem do corretor" (AC1/AC3) e o despacho condicional
 * (AC2/AC4) vivem na route `send-message/route.ts`, que importa módulos
 * `@web/*` + Supabase não resolvíveis no vitest (mesma restrição documentada
 * na Story 51-1). Esse comportamento é coberto pelo smoke pós-deploy descrito
 * na seção Testing da story; aqui isolamos a parte pura/testável.
 */
import { describe, it, expect } from "vitest"
import { buildTransitionText, shouldSendTransition } from "./transition-message"

const EXPECTED = "Já vou te encaminhar para o nosso consultor especialista da Trifold. Ele vai continuar seu atendimento por aqui. 😉"

describe("shouldSendTransition", () => {
  it("cenário 1: nenhuma mensagem role='broker' → 1ª mensagem → envia transição", () => {
    expect(shouldSendTransition(null)).toBe(true)
    expect(shouldSendTransition(undefined)).toBe(true)
  })

  it("cenário 2: já existe role='broker' → 2ª+ mensagem → NÃO envia transição (idempotência AC3)", () => {
    expect(shouldSendTransition({ id: "msg-uuid-1" })).toBe(false)
  })
})

describe("buildTransitionText (Story 75-169 — sem nome do corretor)", () => {
  it("inclui o nome do lead quando presente", () => {
    expect(buildTransitionText("João")).toBe(`Olá João! ${EXPECTED}`)
  })

  it("NÃO cita nome de corretor nem 'Sou ...'", () => {
    const text = buildTransitionText("Andréia")
    expect(text).not.toMatch(/\bSou\b/)
    expect(text).toContain("consultor especialista")
  })

  it("omite a saudação com nome quando leadName é null/vazio", () => {
    expect(buildTransitionText(null)).toBe(`Olá! ${EXPECTED}`)
    expect(buildTransitionText("")).toBe(`Olá! ${EXPECTED}`)
    expect(buildTransitionText("   ")).toBe(`Olá! ${EXPECTED}`)
    expect(buildTransitionText(null)).not.toContain("undefined")
  })

  it("faz trim do nome do lead", () => {
    expect(buildTransitionText("  João  ")).toBe(`Olá João! ${EXPECTED}`)
  })
})
