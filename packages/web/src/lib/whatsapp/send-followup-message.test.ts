/**
 * Story 75-353 — o caminho de template do remetente de follow-up.
 *
 * Cenários que importam:
 *  1. fora da janela SEM template  → WHATSAPP_WINDOW_CLOSED (comportamento antigo, preservado)
 *  2. fora da janela COM template  → template sai, `via: "template"`, log de custo
 *  3. template falha na Meta       → API_ERROR e log `failed` (custo/erro nunca invisível)
 *  4. DENTRO da janela + template  → manda texto livre; não gasta template pago
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const sendTemplateMock = vi.fn<(...a: unknown[]) => Promise<void>>()
vi.mock("@web/lib/whatsapp/send-template", () => ({
  sendWhatsAppTemplate: (...args: unknown[]) => sendTemplateMock(...args),
}))

const sendFreeformMock = vi.fn<(...a: unknown[]) => Promise<{ sent: boolean; error?: string }>>()
vi.mock("@web/lib/whatsapp/send-whatsapp-message", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendFreeformMock(...args),
}))

const logMock = vi.fn()
vi.mock("@web/lib/whatsapp/log-send", () => ({
  logWhatsappSend: (...args: unknown[]) => logMock(...args),
}))

import { sendFollowUpMessage } from "./send-followup-message"

/** Supabase mínimo: só resolve as credenciais de `whatsapp_config`. */
function makeSupabase(config: Record<string, string> | null = { phone_number_id: "123", access_token: "tok" }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: config }),
  }
  return { from: () => builder } as never
}

const FALLBACK = {
  name: "abertura_basica",
  params: ["Marcos"],
  category: "marketing" as const,
  recipientType: "lead",
}

const AGORA = new Date("2026-08-20T12:00:00.000Z")
const FORA_DA_JANELA = new Date("2026-08-18T12:00:00.000Z").toISOString() // 48h atrás
const DENTRO_DA_JANELA = new Date("2026-08-20T09:00:00.000Z").toISOString() // 3h atrás

describe("sendFollowUpMessage — fallback por template (Story 75-353)", () => {
  beforeEach(() => {
    sendTemplateMock.mockReset()
    sendFreeformMock.mockReset()
    logMock.mockReset()
    sendFreeformMock.mockResolvedValue({ sent: true })
  })

  it("cenário 1: fora da janela e SEM template → pula, sem tocar na Meta", async () => {
    const r = await sendFollowUpMessage(makeSupabase(), "org", "5544999", "oi", FORA_DA_JANELA, AGORA)

    expect(r).toEqual({ sent: false, channel: "whatsapp", reason: "WHATSAPP_WINDOW_CLOSED" })
    expect(sendTemplateMock).not.toHaveBeenCalled()
    expect(sendFreeformMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it("cenário 2: fora da janela COM template → entrega por template e registra o custo", async () => {
    sendTemplateMock.mockResolvedValue(undefined)

    const r = await sendFollowUpMessage(
      makeSupabase(),
      "org",
      "5544999",
      "oi",
      FORA_DA_JANELA,
      AGORA,
      FALLBACK
    )

    expect(r).toEqual({ sent: true, channel: "whatsapp", via: "template", template: "abertura_basica" })
    // Texto livre NÃO é tentado fora da janela — a Meta recusaria.
    expect(sendFreeformMock).not.toHaveBeenCalled()
    expect(sendTemplateMock).toHaveBeenCalledOnce()
    const [phoneId, token, to, nome, components] = sendTemplateMock.mock.calls[0]!
    expect([phoneId, token, to, nome]).toEqual(["123", "tok", "5544999", "abertura_basica"])
    expect(components).toEqual([{ type: "body", parameters: [{ type: "text", text: "Marcos" }] }])
    expect(logMock.mock.calls[0]![1]).toMatchObject({
      template: "abertura_basica",
      category: "marketing",
      recipientType: "lead",
      status: "sent",
    })
  })

  it("cenário 3: template falha → API_ERROR e log 'failed' (nunca silencioso)", async () => {
    sendTemplateMock.mockRejectedValue(new Error("WhatsApp API 132000: param mismatch"))

    const r = await sendFollowUpMessage(
      makeSupabase(),
      "org",
      "5544999",
      "oi",
      FORA_DA_JANELA,
      AGORA,
      FALLBACK
    )

    expect(r.sent).toBe(false)
    expect(r.reason).toBe("API_ERROR")
    expect(r.via).toBe("template")
    expect(logMock.mock.calls[0]![1]).toMatchObject({ status: "failed", template: "abertura_basica" })
    expect(String((logMock.mock.calls[0]![1] as { error: string }).error)).toContain("132000")
  })

  it("cenário 4: DENTRO da janela → texto livre, sem gastar template pago", async () => {
    const r = await sendFollowUpMessage(
      makeSupabase(),
      "org",
      "5544999",
      "oi",
      DENTRO_DA_JANELA,
      AGORA,
      FALLBACK
    )

    expect(r).toEqual({ sent: true, channel: "whatsapp", via: "freeform" })
    expect(sendFreeformMock).toHaveBeenCalledOnce()
    expect(sendTemplateMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it("sem credenciais ativas → nem template nem texto livre", async () => {
    const r = await sendFollowUpMessage(
      makeSupabase(null),
      "org",
      "5544999",
      "oi",
      FORA_DA_JANELA,
      AGORA,
      FALLBACK
    )

    expect(r).toEqual({ sent: false, channel: "whatsapp", reason: "WHATSAPP_CONFIG_MISSING" })
    expect(sendTemplateMock).not.toHaveBeenCalled()
  })
})
