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

vi.mock("@web/lib/supabase/admin", () => ({
  // sendBrokerWhatsApp queries whatsapp_config; return none so it short-circuits.
  createAdminClient: () => ({
    from: () => ({
      select: function () { return this },
      eq: function () { return this },
      maybeSingle: async () => ({ data: null, error: null }),
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

import { notifyBroker } from "./notify-broker"

const BROKER = { userId: "u1", name: "João", email: "joao@imob.com", phone: null }
const LEAD = { id: "lead-1", name: "Maria", phone: "5544999990000" }
const CONFIG = { notify_push: true, notify_email: true, notify_whatsapp: true }

beforeEach(() => {
  vi.clearAllMocks()
  sendPushMock.mockResolvedValue(undefined)
  sendEmailMock.mockResolvedValue(undefined)
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
