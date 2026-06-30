/**
 * Story 51-3 (Epic 51) — Tests for the `context` param added to notifyBroker.
 *
 * Covers:
 *  - AC4 backward compat: no `context` → original "Novo lead" copy preserved
 *  - AC2/AC4: with `context` → custom title/body override push + email subject
 *
 * Server deps (admin client, push, email) are mocked so we can assert exactly
 * what copy is dispatched to each channel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

type PushPayload = { title: string; body: string; url: string }
type EmailPayload = { to: string; subject: string; html: string; orgId: string }

const sendPushMock = vi.fn<(admin: unknown, userId: string, payload: PushPayload) => Promise<void>>()
const sendEmailMock = vi.fn<(params: EmailPayload) => Promise<void>>()
const fetchMock = vi.fn()

// Story 75-68: notifyImobiliaria consulta `users` e `whatsapp_config`; o mock ramifica por tabela.
// `gestorPhone` é mutável (lido de forma lazy) p/ testar o caminho sem telefone.
let gestorPhone: string | null = "5518999999999"
const WA_CONFIG = { phone_number_id: "111", access_token: "tok" }
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: function () { return this },
      eq: function () { return this },
      maybeSingle: async () => ({
        data:
          table === "users"
            ? { name: "Fernanda", email: "fernanda@trifold.com", phone: gestorPhone }
            : table === "whatsapp_config"
              ? WA_CONFIG
              : null,
        error: null,
      }),
    }),
  }),
}))
vi.mock("@web/lib/server/push-service", () => ({
  sendPushToUser: (admin: unknown, userId: string, payload: PushPayload) =>
    sendPushMock(admin, userId, payload),
}))
vi.mock("@web/lib/email", () => ({
  sendEmail: (params: EmailPayload) => sendEmailMock(params),
}))
vi.mock("@web/lib/whatsapp/log-send", () => ({ logWhatsappSend: vi.fn() }))

import { notifyBroker, notifyImobiliaria } from "./notify-broker"

const BROKER = { userId: "u1", name: "João", email: "joao@imob.com", phone: null }
const LEAD = { id: "lead-1", name: "Maria", phone: "5544999990000" }
const CONFIG = { notify_push: true, notify_email: true, notify_whatsapp: true }

beforeEach(() => {
  vi.clearAllMocks()
  sendPushMock.mockResolvedValue(undefined)
  sendEmailMock.mockResolvedValue(undefined)
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ id: "wamid.test" }] }),
    text: async () => "",
  })
  global.fetch = fetchMock as unknown as typeof fetch
  gestorPhone = "5518999999999"
})

describe("notifyBroker — context param (Story 51-3)", () => {
  it("sem context → copy padrão de roleta (backward compatible)", async () => {
    await notifyBroker({ orgId: "org-1", broker: BROKER, lead: LEAD, config: CONFIG })

    const pushArgs = sendPushMock.mock.calls[0]![2]
    expect(pushArgs.title).toBe("Novo Lead Recebido")

    const emailArgs = sendEmailMock.mock.calls[0]![0]
    expect(emailArgs.subject).toBe("Novo lead para você: Maria")
  })

  it("com context → título/corpo customizados de agendamento", async () => {
    await notifyBroker({
      orgId: "org-1",
      broker: BROKER,
      lead: LEAD,
      config: CONFIG,
      context: { title: "Visita Agendada!", body: "Maria agendou uma visita com a Nicole." },
    })

    const pushArgs = sendPushMock.mock.calls[0]![2]
    expect(pushArgs.title).toBe("Visita Agendada!")
    expect(pushArgs.body).toBe("Maria agendou uma visita com a Nicole.")

    const emailArgs = sendEmailMock.mock.calls[0]![0]
    expect(emailArgs.subject).toBe("Visita Agendada!")
    expect(emailArgs.html).toContain("Maria agendou uma visita com a Nicole.")
  })
})

describe("notifyImobiliaria — WhatsApp via template aviso_roleta_gestor (Story 75-68)", () => {
  it("envia template (não texto) com botão deep-link = lead.id e body params corretos", async () => {
    await notifyImobiliaria({
      orgId: "org-1",
      userId: "gestor-1",
      title: "Lead distribuído (prioridade)",
      messageBody: "Lead Maria foi enviado para João.",
      lead: { id: "lead-1", name: "Maria", phone: "5544999990000" },
      brokerName: "João",
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)
    expect(body.type).toBe("template")
    expect(body.template.name).toBe("aviso_roleta_gestor")

    const comps = body.template.components as Array<{ type: string; sub_type?: string; parameters: Array<{ text: string }> }>
    const btn = comps.find((c) => c.type === "button")!
    expect(btn.sub_type).toBe("url")
    expect(btn.parameters[0]!.text).toBe("lead-1") // deep-link para o lead exato

    const bodyComp = comps.find((c) => c.type === "body")!
    expect(bodyComp.parameters.map((p) => p.text)).toEqual([
      "Fernanda",
      "Lead Maria foi enviado para João.",
      "Maria — 5544999990000",
    ])
  })

  it("gestor sem telefone → não envia WhatsApp (push/email seguem) [AC4]", async () => {
    gestorPhone = null
    await notifyImobiliaria({
      orgId: "org-1",
      userId: "gestor-1",
      title: "x",
      messageBody: "y",
      lead: { id: "lead-2", name: null, phone: null },
    })
    expect(fetchMock).not.toHaveBeenCalled() // sem WhatsApp
    expect(sendPushMock).toHaveBeenCalled() // push segue
    expect(sendEmailMock).toHaveBeenCalled() // email segue
  })
})
