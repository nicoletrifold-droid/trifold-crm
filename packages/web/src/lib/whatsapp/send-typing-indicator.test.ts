/**
 * Story 75-156 — Testes do indicador "digitando…" no WhatsApp do lead.
 *
 * Helper PURO e fire-and-forget: nunca lança e nunca propaga erro externo.
 */
import { describe, it, expect, vi } from "vitest"
import { sendWhatsAppTypingIndicator } from "./send-typing-indicator"

const WA_CONFIG = { phone_number_id: "111222", access_token: "tok_abc" }
const WAMID = "wamid.HBgLABC123"

function okResponse() {
  return { ok: true, status: 200, text: async () => "" } as unknown as Response
}

describe("sendWhatsAppTypingIndicator (helper puro, fire-and-forget)", () => {
  it("POST no Graph API v21.0 com status:read + typing_indicator sobre o wamid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    await sendWhatsAppTypingIndicator(WA_CONFIG, WAMID, fetchMock)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe("https://graph.facebook.com/v21.0/111222/messages")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_abc")
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: WAMID,
      typing_indicator: { type: "text" },
    })
  })

  it("sem config → não chama fetch (no-op)", async () => {
    const fetchMock = vi.fn()
    await sendWhatsAppTypingIndicator(null, WAMID, fetchMock)
    await sendWhatsAppTypingIndicator({ phone_number_id: "", access_token: "" }, WAMID, fetchMock)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sem wamid → não chama fetch (Meta exige a mensagem inbound)", async () => {
    const fetchMock = vi.fn()
    await sendWhatsAppTypingIndicator(WA_CONFIG, null, fetchMock)
    await sendWhatsAppTypingIndicator(WA_CONFIG, undefined, fetchMock)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falha de rede/timeout é engolida (nunca lança)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
    await expect(
      sendWhatsAppTypingIndicator(WA_CONFIG, WAMID, fetchMock)
    ).resolves.toBeUndefined()
  })
})
