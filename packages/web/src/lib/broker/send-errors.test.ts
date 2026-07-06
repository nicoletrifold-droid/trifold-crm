import { describe, it, expect } from "vitest"
import { classifyWhatsAppSendError, brokerSendErrorMessage } from "./send-errors"

describe("classifyWhatsAppSendError", () => {
  it("marca códigos de indisponibilidade como WHATSAPP_UNREACHABLE", () => {
    expect(classifyWhatsAppSendError(400, 131026)).toBe("WHATSAPP_UNREACHABLE")
    expect(classifyWhatsAppSendError(400, 131021)).toBe("WHATSAPP_UNREACHABLE")
  })
  it("demais casos caem no HTTP_<status>", () => {
    expect(classifyWhatsAppSendError(400, 131000)).toBe("HTTP_400")
    expect(classifyWhatsAppSendError(500, null)).toBe("HTTP_500")
    expect(classifyWhatsAppSendError(400)).toBe("HTTP_400")
  })
})

describe("brokerSendErrorMessage", () => {
  it("mensagem específica para número sem WhatsApp", () => {
    expect(brokerSendErrorMessage("WHATSAPP_UNREACHABLE")).toContain("não ter WhatsApp")
  })
  it("mensagens específicas para janela/config/timeout", () => {
    expect(brokerSendErrorMessage("WHATSAPP_WINDOW_CLOSED")).toContain("24h")
    expect(brokerSendErrorMessage("WHATSAPP_CONFIG_MISSING")).toContain("administrador")
    expect(brokerSendErrorMessage("TIMEOUT")).toContain("Tempo esgotado")
  })
  it("fallback genérico para código desconhecido/nulo", () => {
    expect(brokerSendErrorMessage("HTTP_500")).toBe("Não foi possível enviar a mensagem. Tente novamente.")
    expect(brokerSendErrorMessage(undefined)).toBe("Não foi possível enviar a mensagem. Tente novamente.")
  })
})
