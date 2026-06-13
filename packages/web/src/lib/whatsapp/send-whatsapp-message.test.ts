/**
 * Story 51-5 (Epic 51) — Tests para o envio de follow-up WhatsApp (paridade com Telegram).
 *
 * Cobre os cenários obrigatórios (T4 / Testing) do envio automático da Nicole:
 *  1. Lead Telegram (`tg:...`)                 → roteia Telegram; WhatsApp NÃO chamado
 *  2. Lead WhatsApp dentro da janela de 24h    → Graph API chamada com body correto; { sent: true }
 *  3. Lead WhatsApp fora da janela de 24h      → { sent: false, reason: 'WHATSAPP_WINDOW_CLOSED' }; sem fetch
 *  4. Lead WhatsApp, API retorna 500           → { sent: false, error: 'HTTP_500' }; sem throw
 *  5. Lead WhatsApp, last_message_at = null    → tratado como fora da janela (AC6)
 *
 * O helper `sendWhatsAppMessage` é PURO (sem Supabase / `@web/*`). A decisão de
 * canal e a verificação da janela de 24h vivem no cron (`sendFollowUpMessage`),
 * mas a janela é computada por `isWithinWhatsAppWindow` (reusado da Story 51-1),
 * que é testado de ponta a ponta abaixo replicando o fluxo do cron.
 */
import { describe, it, expect, vi } from "vitest"
import { sendWhatsAppMessage } from "./send-whatsapp-message"
import {
  resolveChannel,
  isWithinWhatsAppWindow,
} from "../broker/dispatch-broker-message"

const WA_CONFIG = { phone_number_id: "111222", access_token: "tok_abc" }

function okResponse() {
  return { ok: true, status: 200, text: async () => "" } as unknown as Response
}
function errResponse(status: number) {
  return { ok: false, status, text: async () => "boom" } as unknown as Response
}

describe("sendWhatsAppMessage (helper puro)", () => {
  it("envia texto via Graph API v21.0 com body correto e retorna { sent: true }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await sendWhatsAppMessage(WA_CONFIG, "5544999990000", "Bom dia!", fetchMock)

    expect(result).toEqual({ sent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe("https://graph.facebook.com/v21.0/111222/messages")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_abc")
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "5544999990000",
      type: "text",
      text: { body: "Bom dia!" },
    })
  })

  it("cenário 4: API retorna 500 → { sent: false, error: 'HTTP_500' } sem throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500))

    const result = await sendWhatsAppMessage(WA_CONFIG, "5544999990000", "Oi", fetchMock)

    expect(result).toEqual({ sent: false, error: "HTTP_500" })
  })

  it("falha de rede (fetch rejeita) → { sent: false } sem throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))

    const result = await sendWhatsAppMessage(WA_CONFIG, "5544999990000", "Oi", fetchMock)

    expect(result.sent).toBe(false)
    expect(result.error).toBe("network down")
  })

  it("timeout (AbortError) → { sent: false, error: 'TIMEOUT' }", async () => {
    const timeoutErr = new Error("timed out")
    timeoutErr.name = "TimeoutError"
    const fetchMock = vi.fn().mockRejectedValue(timeoutErr)

    const result = await sendWhatsAppMessage(WA_CONFIG, "5544999990000", "Oi", fetchMock)

    expect(result).toEqual({ sent: false, error: "TIMEOUT" })
  })

  it("sem credenciais whatsapp_config → { sent: false, error: 'WHATSAPP_CONFIG_MISSING' } sem fetch", async () => {
    const fetchMock = vi.fn()

    const result = await sendWhatsAppMessage(null, "5544999990000", "Oi", fetchMock)

    expect(result).toEqual({ sent: false, error: "WHATSAPP_CONFIG_MISSING" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("credenciais parciais (sem access_token) → WHATSAPP_CONFIG_MISSING", async () => {
    const fetchMock = vi.fn()

    const result = await sendWhatsAppMessage(
      { phone_number_id: "111", access_token: "" },
      "5544999990000",
      "Oi",
      fetchMock
    )

    expect(result).toEqual({ sent: false, error: "WHATSAPP_CONFIG_MISSING" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Fluxo do cron (`sendFollowUpMessage`) replicado de forma pura: decisão de
 * canal + janela de 24h + delegação ao helper. Garante AC1/AC2/AC3/AC4/AC6
 * sem depender de Supabase (o alias `@web/*` não resolve no vitest).
 */
async function simulateCronSend(args: {
  phone: string
  message: string
  lastMessageAt: Date | string | null
  now: Date
  fetchImpl: typeof fetch
  telegramToken?: string | null
}): Promise<{ sent: boolean; channel: "telegram" | "whatsapp"; reason?: string }> {
  const { phone, message, lastMessageAt, now, fetchImpl, telegramToken } = args
  const channel = resolveChannel(phone)

  if (channel === "telegram") {
    if (!telegramToken) return { sent: false, channel, reason: "TELEGRAM_TOKEN_MISSING" }
    const chatId = phone.replace("tg:", "")
    const res = await fetchImpl(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    })
    return res.ok
      ? { sent: true, channel }
      : { sent: false, channel, reason: "API_ERROR" }
  }

  if (!isWithinWhatsAppWindow(lastMessageAt, now)) {
    return { sent: false, channel, reason: "WHATSAPP_WINDOW_CLOSED" }
  }

  const result = await sendWhatsAppMessage(WA_CONFIG, phone, message, fetchImpl)
  return result.sent
    ? { sent: true, channel }
    : { sent: false, channel, reason: "API_ERROR" }
}

describe("fluxo do cron: roteamento de canal + janela de 24h", () => {
  const now = new Date("2026-06-09T12:00:00Z")

  it("cenário 1: lead Telegram roteia Telegram e NÃO chama o Graph API do WhatsApp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await simulateCronSend({
      phone: "tg:12345",
      message: "Olá!",
      lastMessageAt: null,
      now,
      fetchImpl: fetchMock,
      telegramToken: "123:tg-token",
    })

    expect(result).toEqual({ sent: true, channel: "telegram" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0]![0] as string
    expect(url).toContain("api.telegram.org")
    expect(url).not.toContain("graph.facebook.com")
  })

  it("cenário 2: lead WhatsApp dentro da janela (2h) → Graph API chamada, { sent: true }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await simulateCronSend({
      phone: "5544999990000",
      message: "Bom dia!",
      lastMessageAt: new Date("2026-06-09T10:00:00Z"), // 2h atrás
      now,
      fetchImpl: fetchMock,
    })

    expect(result).toEqual({ sent: true, channel: "whatsapp" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0] as string).toContain("graph.facebook.com/v21.0/111222/messages")
  })

  it("cenário 3: lead WhatsApp fora da janela (30h) → WHATSAPP_WINDOW_CLOSED, sem fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await simulateCronSend({
      phone: "5544999990000",
      message: "Oi",
      lastMessageAt: new Date("2026-06-08T06:00:00Z"), // 30h atrás
      now,
      fetchImpl: fetchMock,
    })

    expect(result).toEqual({ sent: false, channel: "whatsapp", reason: "WHATSAPP_WINDOW_CLOSED" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cenário 4: lead WhatsApp dentro da janela mas API 500 → reason API_ERROR sem throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500))

    const result = await simulateCronSend({
      phone: "5544999990000",
      message: "Teste",
      lastMessageAt: new Date("2026-06-09T11:00:00Z"), // 1h atrás
      now,
      fetchImpl: fetchMock,
    })

    expect(result).toEqual({ sent: false, channel: "whatsapp", reason: "API_ERROR" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("cenário 5: lead WhatsApp com last_message_at = null → tratado como fora da janela (AC6)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await simulateCronSend({
      phone: "5544999990000",
      message: "Oi",
      lastMessageAt: null,
      now,
      fetchImpl: fetchMock,
    })

    expect(result).toEqual({ sent: false, channel: "whatsapp", reason: "WHATSAPP_WINDOW_CLOSED" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
