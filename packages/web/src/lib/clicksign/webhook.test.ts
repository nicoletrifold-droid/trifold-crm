import { describe, it, expect } from "vitest"
import { createHmac } from "crypto"
import { verifyClicksignHmac, parseWebhook, mapEventToStatus, deepGet } from "./webhook"

// Payload real (legado/v1) capturado do sandbox: { event: { name }, document: { key, downloads } }
const realPayload = {
  event: { name: "document_closed", data: { account: { key: "acc-1" } }, occurred_at: "2026-07-06T12:18:26.130-03:00" },
  document: {
    key: "11a68121-2a68-4ac4-a78a-aefc9e37389d",
    status: "closed",
    downloads: {
      original_file_url: "https://s3/original.pdf",
      signed_file_url: "https://s3/signed.pdf",
    },
  },
}

describe("parseWebhook", () => {
  it("extrai event.name e document.key do formato real (v1)", () => {
    const { event, documentKey, envelopeId } = parseWebhook(realPayload)
    expect(event).toBe("document_closed")
    expect(documentKey).toBe("11a68121-2a68-4ac4-a78a-aefc9e37389d")
    expect(envelopeId).toBeNull()
  })

  it("extrai o event.name dos eventos sign/auto_close", () => {
    expect(parseWebhook({ event: { name: "sign" }, document: { key: "k" } }).event).toBe("sign")
    expect(parseWebhook({ event: { name: "auto_close" }, document: { key: "k" } }).event).toBe("auto_close")
  })

  it("suporta fallback v2/JSON:API (envelopeId)", () => {
    const v2 = { data: { type: "envelopes", id: "env-123" } }
    const { documentKey, envelopeId } = parseWebhook(v2)
    expect(documentKey).toBeNull()
    expect(envelopeId).toBe("env-123")
  })

  it("retorna nulls para body inválido", () => {
    expect(parseWebhook(null)).toEqual({ event: null, documentKey: null, envelopeId: null })
    expect(parseWebhook("x")).toEqual({ event: null, documentKey: null, envelopeId: null })
  })
})

describe("mapEventToStatus", () => {
  it("mapeia os eventos de finalização/assinatura", () => {
    expect(mapEventToStatus("sign")).toBe("signed")
    expect(mapEventToStatus("close")).toBe("closed")
    expect(mapEventToStatus("auto_close")).toBe("closed")
    expect(mapEventToStatus("document_closed")).toBe("closed")
    expect(mapEventToStatus("refusal")).toBe("refused")
    expect(mapEventToStatus("cancel")).toBe("canceled")
  })
  it("retorna null para eventos que não mudam status", () => {
    expect(mapEventToStatus("add_signer")).toBeNull()
    expect(mapEventToStatus("upload")).toBeNull()
  })
})

describe("verifyClicksignHmac", () => {
  const secret = "b4d6603784ded99bfd30db819240ac74"
  const body = JSON.stringify(realPayload)
  const validHex = createHmac("sha256", secret).update(body, "utf8").digest("hex")

  it("aceita HMAC correto (com prefixo sha256=)", () => {
    expect(verifyClicksignHmac(body, `sha256=${validHex}`, secret)).toBe(true)
  })
  it("aceita HMAC sem prefixo", () => {
    expect(verifyClicksignHmac(body, validHex, secret)).toBe(true)
  })
  it("rejeita HMAC errado, header/secret ausente e body alterado", () => {
    expect(verifyClicksignHmac(body, "sha256=deadbeef", secret)).toBe(false)
    expect(verifyClicksignHmac(body, null, secret)).toBe(false)
    expect(verifyClicksignHmac(body, `sha256=${validHex}`, undefined)).toBe(false)
    expect(verifyClicksignHmac(body + " ", `sha256=${validHex}`, secret)).toBe(false)
  })
})

describe("deepGet", () => {
  it("lê caminho aninhado e retorna undefined em caminho ausente", () => {
    expect(deepGet(realPayload, ["document", "downloads", "signed_file_url"])).toBe("https://s3/signed.pdf")
    expect(deepGet(realPayload, ["document", "nope"])).toBeUndefined()
  })
})
