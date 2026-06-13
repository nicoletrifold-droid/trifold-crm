/**
 * Story 51-1 (Epic 51) — Tests para dispatchBrokerMessage.
 *
 * Cobre os 4 cenários obrigatórios (T5 / Testing):
 *  1. Lead Telegram (`tg:12345`) → dispatch Telegram; WhatsApp NÃO chamado
 *  2. Lead WhatsApp dentro da janela de 24h → `{ sent: true }`
 *  3. Lead WhatsApp fora da janela de 24h → `WHATSAPP_WINDOW_CLOSED`; fetch NÃO chamado
 *  4. Falha externa WhatsApp (fetch 500) → `{ sent: false, error: 'HTTP_500' }`; sem throw
 */
import { describe, it, expect, vi } from "vitest"
import {
  dispatchBrokerMessage,
  resolveChannel,
  isWithinWhatsAppWindow,
} from "./dispatch-broker-message"

const WA_CREDS = { phoneNumberId: "111222", accessToken: "tok_abc" }
const TG_TOKEN = "123:telegram-token"

function okResponse() {
  return { ok: true, status: 200, text: async () => "" } as unknown as Response
}
function errResponse(status: number) {
  return { ok: false, status, text: async () => "error" } as unknown as Response
}

describe("resolveChannel", () => {
  it("retorna telegram para phone com prefixo tg:", () => {
    expect(resolveChannel("tg:12345")).toBe("telegram")
  })
  it("retorna whatsapp para phone numérico", () => {
    expect(resolveChannel("5544999990000")).toBe("whatsapp")
  })
})

describe("isWithinWhatsAppWindow", () => {
  const now = new Date("2026-06-09T12:00:00Z")
  it("true quando última mensagem foi há 2h", () => {
    expect(isWithinWhatsAppWindow(new Date("2026-06-09T10:00:00Z"), now)).toBe(true)
  })
  it("false quando última mensagem foi há 25h", () => {
    expect(isWithinWhatsAppWindow(new Date("2026-06-08T11:00:00Z"), now)).toBe(false)
  })
  it("false quando não há last_message_at", () => {
    expect(isWithinWhatsAppWindow(null, now)).toBe(false)
  })
})

describe("dispatchBrokerMessage", () => {
  it("cenário 1: lead Telegram dispara Telegram e não chama WhatsApp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await dispatchBrokerMessage(
      {
        phone: "tg:12345",
        message: "Olá!",
        conversationLastMessageAt: null,
        telegramBotToken: TG_TOKEN,
        waCredentials: WA_CREDS,
      },
      fetchMock
    )

    expect(result).toEqual({ sent: true, channel: "telegram" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0]![0] as string
    expect(url).toContain("api.telegram.org")
    expect(url).not.toContain("graph.facebook.com")
  })

  it("cenário 2: lead WhatsApp dentro da janela de 24h envia com sucesso", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const now = new Date("2026-06-09T12:00:00Z")

    const result = await dispatchBrokerMessage(
      {
        phone: "5544999990000",
        message: "Bom dia!",
        conversationLastMessageAt: new Date("2026-06-09T10:00:00Z"), // 2h atrás
        waCredentials: WA_CREDS,
        now,
      },
      fetchMock
    )

    expect(result).toEqual({ sent: true, channel: "whatsapp" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0]![0] as string
    expect(url).toContain("graph.facebook.com/v21.0/111222/messages")
  })

  it("cenário 3: lead WhatsApp fora da janela retorna WHATSAPP_WINDOW_CLOSED sem chamar fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const now = new Date("2026-06-09T12:00:00Z")

    const result = await dispatchBrokerMessage(
      {
        phone: "5544999990000",
        message: "Oi",
        conversationLastMessageAt: new Date("2026-06-08T11:00:00Z"), // 25h atrás
        waCredentials: WA_CREDS,
        now,
      },
      fetchMock
    )

    expect(result).toEqual({
      sent: false,
      channel: "whatsapp",
      error: "WHATSAPP_WINDOW_CLOSED",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cenário 4: falha externa WhatsApp (500) retorna HTTP_500 sem throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500))
    const now = new Date("2026-06-09T12:00:00Z")

    const result = await dispatchBrokerMessage(
      {
        phone: "5544999990000",
        message: "Teste",
        conversationLastMessageAt: new Date("2026-06-09T11:00:00Z"),
        waCredentials: WA_CREDS,
        now,
      },
      fetchMock
    )

    expect(result).toEqual({
      sent: false,
      channel: "whatsapp",
      error: "HTTP_500",
    })
  })

  it("WhatsApp sem credenciais retorna WHATSAPP_CONFIG_MISSING", async () => {
    const fetchMock = vi.fn()
    const now = new Date("2026-06-09T12:00:00Z")

    const result = await dispatchBrokerMessage(
      {
        phone: "5544999990000",
        message: "Teste",
        conversationLastMessageAt: new Date("2026-06-09T11:00:00Z"),
        waCredentials: null,
        now,
      },
      fetchMock
    )

    expect(result.sent).toBe(false)
    expect(result.error).toBe("WHATSAPP_CONFIG_MISSING")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Telegram sem token retorna TELEGRAM_TOKEN_MISSING", async () => {
    const fetchMock = vi.fn()

    const result = await dispatchBrokerMessage(
      {
        phone: "tg:999",
        message: "Teste",
        conversationLastMessageAt: null,
        telegramBotToken: null,
      },
      fetchMock
    )

    expect(result.sent).toBe(false)
    expect(result.error).toBe("TELEGRAM_TOKEN_MISSING")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
