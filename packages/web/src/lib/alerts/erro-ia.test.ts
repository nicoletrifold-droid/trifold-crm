import { describe, it, expect } from "vitest"
import { classificarErroIA, deveAlertar, MOTIVO_POR_TIPO } from "./erro-ia"

// Story 87-19 — as strings de `credito` e do falso-positivo do WhatsApp são REAIS,
// copiadas de `system_events` em produção (incidente de 27-28/08/2026). Testar contra
// string inventada aqui seria testar a própria imaginação: o classificador existe
// exatamente para casar o que a API de verdade devolve.

/** A mensagem exata gravada pelo `catch` do webhook em 28/08/2026, 09:05:41 UTC. */
const ERRO_CREDITO_REAL =
  'WhatsApp webhook async error: 400 {"type":"error","error":{"type":"invalid_request_error",' +
  '"message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & ' +
  'Billing to upgrade or purchase credits."},"request_id":"req_011CeT97fvQtPp1WXaAChkn8"}'

describe("classificarErroIA", () => {
  it("classifica a mensagem real de saldo esgotado como 'credito'", () => {
    expect(classificarErroIA(ERRO_CREDITO_REAL)).toBe("credito")
  })

  it("classifica insufficient_quota (OpenAI) como 'credito'", () => {
    expect(
      classificarErroIA('429 {"error":{"type":"insufficient_quota","message":"You exceeded your quota"}}')
    ).toBe("credito")
  })

  it("classifica authentication_error como 'auth'", () => {
    expect(
      classificarErroIA('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')
    ).toBe("auth")
  })

  it("classifica rate_limit_error como 'rate_limit'", () => {
    expect(
      classificarErroIA('429 {"type":"error","error":{"type":"rate_limit_error","message":"..."}}')
    ).toBe("rate_limit")
  })

  it("classifica overloaded_error como 'sobrecarga'", () => {
    expect(
      classificarErroIA('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')
    ).toBe("sobrecarga")
  })

  it("é case-insensitive", () => {
    expect(classificarErroIA("YOUR CREDIT BALANCE IS TOO LOW")).toBe("credito")
  })

  // ─── AC4: os falso-positivos. Estes são os testes que precisam ser capazes de
  // reprovar — se o classificador virar um `return "credito"` genérico, quebram aqui.

  it("NÃO classifica o rate limit da Graph API do WhatsApp (falso positivo #1)", () => {
    // A Meta escreve "rate limit" com espaço; só `rate_limit_error` é da API de IA.
    expect(
      classificarErroIA('WhatsApp API 400: {"error":{"message":"(#80007) rate limit hit","code":80007}}')
    ).toBeNull()
  })

  it("NÃO classifica erro do Supabase", () => {
    expect(
      classificarErroIA('Failed to insert lead: {"code":"23505","message":"duplicate key value"}')
    ).toBeNull()
  })

  it("NÃO classifica erro de código genérico", () => {
    expect(classificarErroIA("TypeError: Cannot read properties of undefined")).toBeNull()
  })

  it("NÃO classifica um 400 qualquer só por ser 400", () => {
    expect(
      classificarErroIA('WhatsApp webhook async error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages: at least one message is required"}}')
    ).toBeNull()
  })

  it("devolve null para string vazia", () => {
    expect(classificarErroIA("")).toBeNull()
  })
})

describe("deveAlertar", () => {
  it("credito e auth alertam na PRIMEIRA ocorrência", () => {
    expect(deveAlertar("credito", 1)).toBe(true)
    expect(deveAlertar("auth", 1)).toBe(true)
  })

  it("rate_limit e sobrecarga NÃO alertam com 1 ou 2 ocorrências", () => {
    expect(deveAlertar("rate_limit", 1)).toBe(false)
    expect(deveAlertar("rate_limit", 2)).toBe(false)
    expect(deveAlertar("sobrecarga", 2)).toBe(false)
  })

  it("rate_limit e sobrecarga alertam a partir de 3", () => {
    expect(deveAlertar("rate_limit", 3)).toBe(true)
    expect(deveAlertar("sobrecarga", 4)).toBe(true)
  })
})

describe("MOTIVO_POR_TIPO", () => {
  it("tem um texto para cada um dos 4 tipos", () => {
    for (const tipo of ["credito", "auth", "rate_limit", "sobrecarga"] as const) {
      expect(MOTIVO_POR_TIPO[tipo]).toBeTruthy()
    }
  })
})
