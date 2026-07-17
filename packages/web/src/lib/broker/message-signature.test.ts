import { describe, expect, it } from "vitest"

import { buildSignedMessage, senderFirstName } from "./message-signature"

describe("senderFirstName (Story 75-171)", () => {
  it("extrai o primeiro nome de um nome composto", () => {
    expect(senderFirstName("Valeria Souza")).toBe("Valeria")
  })

  it("mantém nome único", () => {
    expect(senderFirstName("Marcos")).toBe("Marcos")
  })

  it("faz trim antes de extrair", () => {
    expect(senderFirstName("  Valeria   Souza ")).toBe("Valeria")
  })

  it("devolve vazio para null/undefined/vazio/só espaços", () => {
    expect(senderFirstName(null)).toBe("")
    expect(senderFirstName(undefined)).toBe("")
    expect(senderFirstName("")).toBe("")
    expect(senderFirstName("   ")).toBe("")
  })
})

describe("buildSignedMessage (Story 75-171)", () => {
  it("WhatsApp: prefixo em negrito nativo *Nome:* + quebra de linha (AC1)", () => {
    expect(buildSignedMessage("Valeria Souza", "Oi, tudo bem?", "whatsapp")).toBe(
      "*Valeria:*\nOi, tudo bem?"
    )
  })

  it("Telegram: prefixo sem asteriscos (sem parse_mode, apareceriam crus) (AC2)", () => {
    expect(buildSignedMessage("Valeria Souza", "Oi, tudo bem?", "telegram")).toBe(
      "Valeria:\nOi, tudo bem?"
    )
  })

  it("nome vazio → mensagem inalterada (AC5)", () => {
    expect(buildSignedMessage("", "Oi", "whatsapp")).toBe("Oi")
    expect(buildSignedMessage(null, "Oi", "whatsapp")).toBe("Oi")
    expect(buildSignedMessage("   ", "Oi", "telegram")).toBe("Oi")
  })

  it("não altera o corpo da mensagem (multi-linha preservada)", () => {
    expect(buildSignedMessage("Marcos", "linha 1\nlinha 2", "whatsapp")).toBe(
      "*Marcos:*\nlinha 1\nlinha 2"
    )
  })
})
