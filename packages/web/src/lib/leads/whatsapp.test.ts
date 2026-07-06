import { describe, it, expect } from "vitest"
import { isLikelyMobileBR, isWhatsAppConfirmed, whatsAppState } from "./whatsapp"

describe("isLikelyMobileBR", () => {
  it("aceita celulares válidos (com/sem DDI e com máscara)", () => {
    expect(isLikelyMobileBR("44999114326")).toBe(true)
    expect(isLikelyMobileBR("+5544999114326")).toBe(true)
    expect(isLikelyMobileBR("5544999114326")).toBe(true)
    expect(isLikelyMobileBR("(44) 99911-4326")).toBe(true)
  })
  it("rejeita fixo, vazio, nulo e telegram", () => {
    expect(isLikelyMobileBR("4433334444")).toBe(false) // fixo (8 díg., sem 9)
    expect(isLikelyMobileBR("")).toBe(false)
    expect(isLikelyMobileBR(null)).toBe(false)
    expect(isLikelyMobileBR("tg:12345")).toBe(false)
    expect(isLikelyMobileBR("123")).toBe(false)
  })
})

describe("isWhatsAppConfirmed", () => {
  it("true por origem WhatsApp/CTWA (case-insensitive) ou conversa existente", () => {
    expect(isWhatsAppConfirmed({ source: "whatsapp_click_to_ad" })).toBe(true)
    expect(isWhatsAppConfirmed({ source: "WhatsApp" })).toBe(true)
    expect(isWhatsAppConfirmed({ source: "ctwa" })).toBe(true)
    expect(isWhatsAppConfirmed({ hasWhatsappConversation: true })).toBe(true)
  })
  it("false para outras origens sem conversa", () => {
    expect(isWhatsAppConfirmed({ source: "meta_ads" })).toBe(false)
    expect(isWhatsAppConfirmed({ source: null })).toBe(false)
    expect(isWhatsAppConfirmed({})).toBe(false)
  })
})

describe("whatsAppState", () => {
  it("confirmed quando comprovado", () => {
    expect(whatsAppState({ phone: "44999114326", source: "whatsapp_click_to_ad" })).toBe("confirmed")
    expect(whatsAppState({ phone: "44999114326", hasWhatsappConversation: true })).toBe("confirmed")
  })
  it("likely quando só celular válido", () => {
    expect(whatsAppState({ phone: "44999114326", source: "meta_ads" })).toBe("likely")
  })
  it("none quando não é celular ou é telegram", () => {
    expect(whatsAppState({ phone: "4433334444", source: "meta_ads" })).toBe("none")
    expect(whatsAppState({ phone: "tg:1", hasWhatsappConversation: true })).toBe("none")
    expect(whatsAppState({ phone: null })).toBe("none")
  })
})
