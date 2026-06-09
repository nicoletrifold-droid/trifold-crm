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
import {
  buildTransitionText,
  shouldSendTransition,
  BROKER_NAME_FALLBACK,
} from "./transition-message"

describe("shouldSendTransition", () => {
  it("cenário 1: nenhuma mensagem role='broker' → 1ª mensagem → envia transição", () => {
    expect(shouldSendTransition(null)).toBe(true)
    expect(shouldSendTransition(undefined)).toBe(true)
  })

  it("cenário 2: já existe role='broker' → 2ª+ mensagem → NÃO envia transição (idempotência AC3)", () => {
    expect(shouldSendTransition({ id: "msg-uuid-1" })).toBe(false)
  })
})

describe("buildTransitionText", () => {
  it("inclui o nome do lead quando presente", () => {
    const text = buildTransitionText("João", "Maria")
    expect(text).toBe(
      "Olá João! Sou Maria, da equipe Trifold. Estou aqui para continuar te ajudando. 😊"
    )
  })

  it("omite a saudação com nome quando leadName é null", () => {
    const text = buildTransitionText(null, "Maria")
    expect(text).toBe(
      "Olá! Sou Maria, da equipe Trifold. Estou aqui para continuar te ajudando. 😊"
    )
    expect(text).not.toContain("undefined")
    expect(text).not.toContain("null")
  })

  it("omite a saudação com nome quando leadName é string vazia/espaços", () => {
    expect(buildTransitionText("", "Maria")).toBe(
      "Olá! Sou Maria, da equipe Trifold. Estou aqui para continuar te ajudando. 😊"
    )
    expect(buildTransitionText("   ", "Maria")).toBe(
      "Olá! Sou Maria, da equipe Trifold. Estou aqui para continuar te ajudando. 😊"
    )
  })

  it("usa fallback gracioso quando brokerName é null", () => {
    const text = buildTransitionText("João", null)
    expect(text).toBe(
      `Olá João! Sou ${BROKER_NAME_FALLBACK}, da equipe Trifold. Estou aqui para continuar te ajudando. 😊`
    )
  })

  it("usa fallback gracioso quando brokerName é string vazia/espaços", () => {
    expect(buildTransitionText("João", "")).toContain(BROKER_NAME_FALLBACK)
    expect(buildTransitionText("João", "   ")).toContain(BROKER_NAME_FALLBACK)
  })

  it("aplica fallback de corretor e omite nome do lead simultaneamente", () => {
    const text = buildTransitionText(null, undefined)
    expect(text).toBe(
      `Olá! Sou ${BROKER_NAME_FALLBACK}, da equipe Trifold. Estou aqui para continuar te ajudando. 😊`
    )
  })

  it("faz trim dos nomes (sem espaços nas bordas no texto final)", () => {
    const text = buildTransitionText("  João  ", "  Maria  ")
    expect(text).toBe(
      "Olá João! Sou Maria, da equipe Trifold. Estou aqui para continuar te ajudando. 😊"
    )
  })
})
