/**
 * Story 51-4 (Epic 51) — Tests for notifyBrokerOfStalledLead (Gatilho B).
 *
 * Covers the mandatory scenarios:
 *  1. assigned_broker_id present + no recent alert → notification dispatched
 *  2. assigned_broker_id null + manager exists     → notification to manager (fallback, AC4)
 *  3. assigned_broker_id null + no manager/admin    → warn, no throw, no notification (AC4)
 *  4. recent open alert (<48h, >1 row)              → no notification (anti-spam, AC5)
 *  5. notifyBroker throws                            → cron-safe, no throw, returns false (AC6)
 *
 * Also verifies the follow-up copy ("Lead parado — ação necessária") and that org
 * notify prefs fall back to all-channels-enabled when roleta_config is absent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// server-only is a build-time guard with no runtime behaviour in tests.
vi.mock("server-only", () => ({}))

type NotifyResult = { push: boolean; email: boolean; whatsapp: boolean }
const notifyBrokerMock = vi.fn<(params: Record<string, unknown>) => Promise<NotifyResult>>()
vi.mock("@web/lib/roleta/notify-broker", () => ({
  notifyBroker: (params: Record<string, unknown>) => notifyBrokerMock(params),
}))

import { notifyBrokerOfStalledLead } from "../../../../lib/broker/notify-stalled-lead"

// In-memory Supabase stub. Each table resolves from a configurable slice of state.
interface StubState {
  // follow_up_log rows returned by the anti-spam query (terminates in .order()).
  followUpLog: Array<Record<string, unknown>>
  // users row when querying by id (.eq("id", ...).maybeSingle()).
  brokerById: Record<string, unknown> | null
  // users row when querying by role fallback (.in("role", ...).maybeSingle()).
  fallbackUser: Record<string, unknown> | null
  // roleta_config row (.maybeSingle()).
  config: Record<string, unknown> | null
}

const state: StubState = {
  followUpLog: [],
  brokerById: null,
  fallbackUser: null,
  config: null,
}

function makeSupabase() {
  return {
    from(table: string) {
      // Track whether the users query is the role-fallback variant.
      let isRoleQuery = false
      const builder: Record<string, unknown> = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        neq() {
          return builder
        },
        gte() {
          return builder
        },
        not() {
          return builder
        },
        in() {
          isRoleQuery = true
          return builder
        },
        limit() {
          return builder
        },
        // follow_up_log anti-spam query terminates here (returns an array).
        order() {
          if (table === "follow_up_log") {
            return Promise.resolve({ data: state.followUpLog, error: null })
          }
          return builder
        },
        maybeSingle: async () => {
          if (table === "users") {
            return {
              data: isRoleQuery ? state.fallbackUser : state.brokerById,
              error: null,
            }
          }
          if (table === "roleta_config") {
            return { data: state.config, error: null }
          }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = makeSupabase() as any

const BASE = {
  supabase,
  orgId: "org-1",
  assignedBrokerId: "broker-user-1" as string | null,
  leadId: "lead-1",
  leadName: "Maria Silva",
  leadPhone: "5544999990000",
  daysSinceLastMessage: 5,
}

beforeEach(() => {
  vi.clearAllMocks()
  notifyBrokerMock.mockResolvedValue({ push: true, email: true, whatsapp: true })
  // Default happy path: the alert row the cron just inserted (exactly 1 → no prior alert).
  state.followUpLog = [{ id: "alert-just-inserted", created_at: new Date().toISOString() }]
  state.brokerById = { id: "broker-user-1", name: "Corretor João", email: "joao@imob.com", phone: "5544988887777" }
  state.fallbackUser = { id: "mgr-1", name: "Gerente Ana", email: "ana@imob.com", phone: "5544977776666" }
  state.config = { notify_push: true, notify_email: true, notify_whatsapp: true }
})

describe("notifyBrokerOfStalledLead", () => {
  it("(1) broker atribuído + sem alerta prévio → dispara notificação com copy de follow-up esgotado", async () => {
    const result = await notifyBrokerOfStalledLead(BASE)

    expect(result).toBe(true)
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
      title: "Lead parado — ação necessária",
      body: "Maria Silva está sem resposta há 5 dia(s) após os follow-ups da Nicole. Ligue ou envie mensagem.",
    })
  })

  it("(2) sem broker atribuído + gerente existe → notifica o gerente (fallback AC4)", async () => {
    const result = await notifyBrokerOfStalledLead({ ...BASE, assignedBrokerId: null })

    expect(result).toBe(true)
    expect(notifyBrokerMock).toHaveBeenCalledTimes(1)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.broker).toMatchObject({ userId: "mgr-1", email: "ana@imob.com" })
  })

  it("(3) sem broker atribuído + sem gerente/admin → warn, sem throw, sem notificação (AC4)", async () => {
    state.fallbackUser = null
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await notifyBrokerOfStalledLead({ ...BASE, assignedBrokerId: null })

    expect(result).toBe(false)
    expect(notifyBrokerMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("(4) alerta aberto recente (<48h, >1 linha) → não notifica (anti-spam AC5)", async () => {
    state.followUpLog = [
      { id: "alert-prior", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      { id: "alert-just-inserted", created_at: new Date().toISOString() },
    ]

    const result = await notifyBrokerOfStalledLead(BASE)

    expect(result).toBe(false)
    expect(notifyBrokerMock).not.toHaveBeenCalled()
  })

  it("(5) notifyBroker lança erro → cron-safe, retorna false, sem propagação (AC6)", async () => {
    notifyBrokerMock.mockRejectedValueOnce(new Error("push service down"))
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await notifyBrokerOfStalledLead(BASE)

    expect(result).toBe(false)
    errSpy.mockRestore()
  })

  it("broker sem email → fallback para gerente/admin", async () => {
    state.brokerById = { id: "broker-user-1", name: "Sem Email", email: null, phone: null }

    const result = await notifyBrokerOfStalledLead(BASE)

    expect(result).toBe(true)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.broker).toMatchObject({ userId: "mgr-1", email: "ana@imob.com" })
  })

  it("sem roleta_config → default todos os canais habilitados", async () => {
    state.config = null
    await notifyBrokerOfStalledLead(BASE)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.config).toEqual({
      notify_push: true,
      notify_email: true,
      notify_whatsapp: true,
    })
  })

  it("respeita prefs da org (ex.: whatsapp off)", async () => {
    state.config = { notify_push: true, notify_email: true, notify_whatsapp: false }
    await notifyBrokerOfStalledLead(BASE)
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect(params.config).toEqual({
      notify_push: true,
      notify_email: true,
      notify_whatsapp: false,
    })
  })

  it("lead sem nome → usa fallback 'O lead' no body", async () => {
    await notifyBrokerOfStalledLead({ ...BASE, leadName: null })
    const params = notifyBrokerMock.mock.calls[0]![0]
    expect((params.context as { body: string }).body).toContain("O lead está sem resposta")
  })
})
