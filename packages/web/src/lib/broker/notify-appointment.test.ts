/**
 * Story 51-3 (Epic 51) — Tests for notifyBrokerOfAppointment.
 *
 * Covers the mandatory AC8 scenarios at the dispatch boundary:
 *  (a) assignedBrokerId present  → notifyBroker called with appointment context
 *  (b) assignedBrokerId null     → notifyBroker NOT called
 *  (c) notifyBroker throws       → no throw propagated (appointment flow safe — AC6)
 *
 * Also verifies:
 *  - the appointment `context` (title/body) is forwarded to notifyBroker (AC2/AC4)
 *  - broker contact is resolved from `users` via the broker user_id (RLS migration 085)
 *  - org notify prefs fall back to all-channels-enabled when roleta_config is absent
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// server-only is a build-time guard with no runtime behaviour in tests.
vi.mock("server-only", () => ({}))

type NotifyResult = { push: boolean; email: boolean; whatsapp: boolean }
const notifyBrokerMock = vi.fn<(params: Record<string, unknown>) => Promise<NotifyResult>>()
vi.mock("@web/lib/roleta/notify-broker", () => ({
  notifyBroker: (params: Record<string, unknown>) => notifyBrokerMock(params),
}))

// In-memory admin client: returns broker row from `users` and config from `roleta_config`.
interface AdminState {
  user: Record<string, unknown> | null
  config: Record<string, unknown> | null
}
const adminState: AdminState = { user: null, config: null }

function makeAdmin() {
  return {
    from(table: string) {
      const target = table === "users" ? "user" : "config"
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        maybeSingle: async () => ({
          data: adminState[target as keyof AdminState],
          error: null,
        }),
      }
    },
  }
}
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdmin(),
}))

import { notifyBrokerOfAppointment } from "./notify-appointment"

const BASE = {
  orgId: "org-1",
  brokerUserId: "broker-user-1",
  leadId: "lead-1",
  leadName: "Maria Silva",
  leadPhone: "5544999990000",
}

beforeEach(() => {
  vi.clearAllMocks()
  notifyBrokerMock.mockResolvedValue({ push: true, email: true, whatsapp: true })
  adminState.user = { name: "Corretor João", email: "joao@imob.com", phone: "5544988887777" }
  adminState.config = { notify_push: true, notify_email: true, notify_whatsapp: true }
})

describe("notifyBrokerOfAppointment", () => {
  it("(a) com broker atribuído → chama notifyBroker com context de agendamento", async () => {
    await notifyBrokerOfAppointment(BASE)

    expect(notifyBrokerMock).toHaveBeenCalledTimes(1)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.orgId).toBe("org-1")
    expect(params.broker).toMatchObject({
      userId: "broker-user-1",
      email: "joao@imob.com",
      phone: "5544988887777",
    })
    expect(params.lead).toMatchObject({ id: "lead-1", name: "Maria Silva", phone: "5544999990000" })
    expect(params.context).toEqual({
      title: "Visita Agendada!",
      body: "Maria Silva agendou uma visita com a Nicole.",
    })
  })

  it("(b) sem broker atribuído (brokerUserId vazio) → NÃO chama notifyBroker", async () => {
    await notifyBrokerOfAppointment({ ...BASE, brokerUserId: "" })
    expect(notifyBrokerMock).not.toHaveBeenCalled()
  })

  it("(c) notifyBroker lança erro → não propaga (fluxo de agendamento seguro)", async () => {
    notifyBrokerMock.mockRejectedValueOnce(new Error("push service down"))
    await expect(notifyBrokerOfAppointment(BASE)).resolves.toBeUndefined()
  })

  it("broker sem email → não notifica", async () => {
    adminState.user = { name: "Sem Email", email: null, phone: null }
    await notifyBrokerOfAppointment(BASE)
    expect(notifyBrokerMock).not.toHaveBeenCalled()
  })

  it("sem roleta_config → default todos os canais habilitados", async () => {
    adminState.config = null
    await notifyBrokerOfAppointment(BASE)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.config).toEqual({
      notify_push: true,
      notify_email: true,
      notify_whatsapp: true,
    })
  })

  it("respeita prefs da org quando roleta_config existe (ex.: whatsapp off)", async () => {
    adminState.config = { notify_push: true, notify_email: false, notify_whatsapp: false }
    await notifyBrokerOfAppointment(BASE)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.config).toEqual({
      notify_push: true,
      notify_email: false,
      notify_whatsapp: false,
    })
  })

  it("lead sem nome → usa fallback 'O lead' no body", async () => {
    await notifyBrokerOfAppointment({ ...BASE, leadName: null })
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect((params.context as { body: string }).body).toBe("O lead agendou uma visita com a Nicole.")
  })
})
