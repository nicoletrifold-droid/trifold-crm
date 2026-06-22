/**
 * Story 51-8 (Epic 51) — Tests para o envio de TEMPLATE HSM via WhatsApp Cloud API.
 *
 * Cobre os cenários obrigatórios (AC8 / T2) do helper puro `sendWhatsAppTemplate`:
 *  1. Config null                          → WHATSAPP_CONFIG_MISSING; sem fetch
 *  2. Config parcial (sem access_token)    → WHATSAPP_CONFIG_MISSING; sem fetch
 *  3. HTTP 200                             → { sent: true } + payload type:"template" correto
 *  4. HTTP 400                             → { sent: false, error: "HTTP_400" }; sem throw
 *  5. falha de rede (fetch rejeita)        → { sent: false, error: <msg> }; sem throw
 *  6. TimeoutError                         → { sent: false, error: "TIMEOUT" }
 *  7. AbortError                           → { sent: false, error: "TIMEOUT" }
 *  + estrutura do button component validada no payload (sub_type, index, parameters)
 *
 * O helper é PURO (sem Supabase / `@web/*`). Os testes importam só de
 * `./send-whatsapp-template` e o tipo `WhatsAppConfig` de `./send-whatsapp-message`.
 */
import { describe, it, expect, vi } from "vitest"
import {
  sendWhatsAppTemplate,
  type WhatsAppTemplateComponent,
} from "./send-whatsapp-template"
import type { WhatsAppConfig } from "./send-whatsapp-message"

const WA_CONFIG: WhatsAppConfig = { phone_number_id: "111222", access_token: "tok_abc" }

const SAMPLE_COMPONENTS: WhatsAppTemplateComponent[] = [
  {
    type: "body",
    parameters: [
      { type: "text", text: "Robson" },
      { type: "text", text: "Maria Lead" },
      { type: "text", text: "5544988887777" },
    ],
  },
  {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: "uuid-lead-123" }],
  },
]

function okResponse() {
  return { ok: true, status: 200, text: async () => "" } as unknown as Response
}
function errResponse(status: number) {
  return { ok: false, status, text: async () => "boom" } as unknown as Response
}

describe("sendWhatsAppTemplate (helper puro)", () => {
  it("cenário 1: config null → { sent: false, error: 'WHATSAPP_CONFIG_MISSING' } sem fetch", async () => {
    const fetchMock = vi.fn()

    const result = await sendWhatsAppTemplate(
      null,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result).toEqual({ sent: false, error: "WHATSAPP_CONFIG_MISSING" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cenário 2: config sem access_token → WHATSAPP_CONFIG_MISSING sem fetch", async () => {
    const fetchMock = vi.fn()

    const result = await sendWhatsAppTemplate(
      { phone_number_id: "111", access_token: "" },
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result).toEqual({ sent: false, error: "WHATSAPP_CONFIG_MISSING" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cenário 3: HTTP 200 → { sent: true } com payload type:'template' correto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    const result = await sendWhatsAppTemplate(
      WA_CONFIG,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result).toEqual({ sent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe("https://graph.facebook.com/v21.0/111222/messages")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_abc")

    const body = JSON.parse(init.body as string)
    expect(body.messaging_product).toBe("whatsapp")
    expect(body.to).toBe("5544999990000")
    expect(body.type).toBe("template")
    expect(body.template.name).toBe("novo_lead_corretor")
    expect(body.template.language.code).toBe("pt_BR")
    expect(body.template.components).toHaveLength(2)
    expect(body.template.components[0].type).toBe("body")
    expect(body.template.components[0].parameters).toHaveLength(3)
  })

  it("estrutura do button component preservada no payload (sub_type, index, parameters)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())

    await sendWhatsAppTemplate(
      WA_CONFIG,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    const button = body.template.components[1]
    expect(button.type).toBe("button")
    expect(button.sub_type).toBe("url")
    expect(button.index).toBe("0")
    expect(button.parameters).toEqual([{ type: "text", text: "uuid-lead-123" }])
  })

  it("cenário 4: HTTP 400 → { sent: false, error: 'HTTP_400' } sem throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400))

    const result = await sendWhatsAppTemplate(
      WA_CONFIG,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result).toEqual({ sent: false, error: "HTTP_400" })
  })

  it("cenário 5: falha de rede (fetch rejeita) → { sent: false } sem throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))

    const result = await sendWhatsAppTemplate(
      WA_CONFIG,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result.sent).toBe(false)
    expect(result.error).toBe("network down")
  })

  it("cenário 6: TimeoutError → { sent: false, error: 'TIMEOUT' }", async () => {
    const timeoutErr = new Error("timed out")
    timeoutErr.name = "TimeoutError"
    const fetchMock = vi.fn().mockRejectedValue(timeoutErr)

    const result = await sendWhatsAppTemplate(
      WA_CONFIG,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result).toEqual({ sent: false, error: "TIMEOUT" })
  })

  it("cenário 7: AbortError → { sent: false, error: 'TIMEOUT' }", async () => {
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    const fetchMock = vi.fn().mockRejectedValue(abortErr)

    const result = await sendWhatsAppTemplate(
      WA_CONFIG,
      "5544999990000",
      { name: "novo_lead_corretor", languageCode: "pt_BR", components: SAMPLE_COMPONENTS },
      fetchMock
    )

    expect(result).toEqual({ sent: false, error: "TIMEOUT" })
  })
})
