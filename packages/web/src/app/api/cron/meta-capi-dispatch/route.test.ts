/**
 * Story 86-4 — cron que drena a meta_capi_outbox e envia o evento "Visitou" à CAPI.
 * Cobre: auth (401/500), lote vazio, sucesso total (marca sent), falha (incrementa
 * attempts → failed ao atingir MAX_ATTEMPTS), idempotência (update condicional em
 * status='pending'), ausência de token tratada graciosamente, e o enriquecimento
 * opcional de atribuição (metadata.meta_ad ausente antes da 86-6).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// --- CAPI module (Story 86-3): só mockamos o envio de rede; os builders são reais.
type CapiResult = { success: boolean; eventsReceived?: number; error?: string }
const sendCapiEvents = vi.fn<(...args: unknown[]) => Promise<CapiResult>>(async () => ({
  success: true,
  eventsReceived: 1,
}))
vi.mock("@trifold/shared", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    sendCapiEvents: (...args: unknown[]) =>
      (sendCapiEvents as (...a: unknown[]) => unknown)(...args),
  }
})

// --- Admin client mock: roteia por tabela, captura updates (com o .eq condicional).
type Result = { data: unknown; error: unknown }
let outboxSelect: Result = { data: [], error: null }
let leadsSelect: Result = { data: [], error: null }
let updates: Array<{ table: string; payload: unknown; eqs: Record<string, unknown> }> = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      let pendingUpdate: unknown = null
      const eqs: Record<string, unknown> = {}
      for (const m of ["select", "in", "order", "limit"]) b[m] = vi.fn(() => b)
      b.eq = vi.fn((col: string, val: unknown) => {
        eqs[col] = val
        return b
      })
      b.update = vi.fn((payload: unknown) => {
        pendingUpdate = payload
        return b
      })
      b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => {
        if (pendingUpdate) {
          updates.push({ table, payload: pendingUpdate, eqs: { ...eqs } })
          return Promise.resolve({ data: null, error: null }).then(res, rej)
        }
        const sel = table === "leads" ? leadsSelect : outboxSelect
        return Promise.resolve(sel).then(res, rej)
      }
      return b
    },
  }),
}))

process.env.CRON_SECRET = "test-secret"
const { GET } = await import("./route")

function call(auth: string | null = "Bearer test-secret") {
  return GET(
    new Request("https://x/api/cron/meta-capi-dispatch", {
      headers: auth ? { authorization: auth } : {},
    }) as never,
  )
}

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ob-1",
    lead_id: "lead-1",
    event_id: "visit_lead-1_abc",
    event_name: "Schedule",
    attempts: 0,
    created_at: new Date("2026-08-04T12:00:00Z").toISOString(),
    ...overrides,
  }
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    name: "Maria Silva",
    email: "maria@example.com",
    phone: "44999114326",
    metadata: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  outboxSelect = { data: [], error: null }
  leadsSelect = { data: [], error: null }
  sendCapiEvents.mockResolvedValue({ success: true, eventsReceived: 1 })
  delete process.env.META_CAPI_TEST_EVENT_CODE
})

describe("GET /api/cron/meta-capi-dispatch", () => {
  it("sem secret → 401", async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call("Bearer errado")).status).toBe(401)
  })

  it("lote vazio → ok sem chamar a CAPI", async () => {
    const body = await (await call()).json()
    expect(body).toMatchObject({ ok: true, scanned: 0, sent: 0, failed: 0, skipped: 0 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
  })

  it("sucesso total → marca sent com update condicional em status='pending'", async () => {
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()

    expect(body).toMatchObject({ scanned: 1, sent: 1, failed: 0, skipped: 0 })
    expect(sendCapiEvents).toHaveBeenCalledTimes(1)
    // Evento montado a partir da linha da outbox (event_id + event_time da row).
    const [eventsArg] = sendCapiEvents.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    expect(eventsArg).toHaveLength(1)
    expect(eventsArg[0]).toMatchObject({
      event_name: "Schedule",
      event_id: "visit_lead-1_abc",
      event_time: Math.floor(new Date("2026-08-04T12:00:00Z").getTime() / 1000),
    })
    // AC5 + AC10: update de sent condicional em status pending.
    const sentUpdate = updates.find((u) => u.table === "meta_capi_outbox")
    expect(sentUpdate?.payload).toMatchObject({ status: "sent" })
    expect((sentUpdate?.payload as Record<string, unknown>).sent_at).toBeTruthy()
    expect(sentUpdate?.eqs).toMatchObject({ id: "ob-1", status: "pending" })
  })

  it("falha da CAPI → incrementa attempts e mantém pending (abaixo de MAX_ATTEMPTS)", async () => {
    sendCapiEvents.mockResolvedValueOnce({ success: false, error: "Graph 500" })
    outboxSelect = { data: [outboxRow({ attempts: 0 })], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()

    expect(body).toMatchObject({ sent: 0, failed: 1 })
    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({
      attempts: 1,
      status: "pending",
      last_error: "Graph 500",
    })
    expect(upd?.eqs).toMatchObject({ status: "pending" })
  })

  it("falha na última tentativa → marca failed ao atingir MAX_ATTEMPTS", async () => {
    sendCapiEvents.mockResolvedValueOnce({ success: false, error: "Graph 500" })
    outboxSelect = { data: [outboxRow({ attempts: 2 })], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    await call()

    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({ attempts: 3, status: "failed" })
  })

  it("token ausente → sendCapiEvents retorna erro; trata como falha graciosa (sem throw)", async () => {
    // Simula o retorno real do módulo 86-3 quando META_CAPI_ACCESS_TOKEN falta.
    sendCapiEvents.mockResolvedValueOnce({
      success: false,
      error: "META_CAPI_ACCESS_TOKEN is not configured",
    })
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, sent: 0, failed: 1 })
    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({
      last_error: "META_CAPI_ACCESS_TOKEN is not configured",
      status: "pending",
    })
  })

  it("events_received divergente → tratado como falha (AC6)", async () => {
    sendCapiEvents.mockResolvedValueOnce({ success: true, eventsReceived: 0 })
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 0, failed: 1 })
  })

  it("lead sem metadata.meta_ad (pré-86-6) → envia mesmo assim, sem fbc/fbp", async () => {
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow({ metadata: null })], error: null }

    await call()

    const [eventsArg] = sendCapiEvents.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    const userData = eventsArg[0]!.user_data as Record<string, unknown>
    // external_id sempre presente; fbc/fbp/client ausentes (86-6 ainda não capturou).
    expect(userData.external_id).toBeTruthy()
    expect(userData.fbc).toBeUndefined()
    expect(userData.fbp).toBeUndefined()
    expect(userData.client_ip_address).toBeUndefined()
  })

  it("lead com metadata.meta_ad (pós-86-6) → propaga fbc/fbp/client_ip em plain text", async () => {
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = {
      data: [
        leadRow({
          metadata: {
            meta_ad: {
              fbc: "fb.1.123.abc",
              fbp: "fb.1.456.def",
              client_ip: "203.0.113.7",
              client_ua: "Mozilla/5.0",
            },
          },
        }),
      ],
      error: null,
    }

    await call()

    const [eventsArg] = sendCapiEvents.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    const userData = eventsArg[0]!.user_data as Record<string, unknown>
    expect(userData).toMatchObject({
      fbc: "fb.1.123.abc",
      fbp: "fb.1.456.def",
      client_ip_address: "203.0.113.7",
      client_user_agent: "Mozilla/5.0",
    })
  })

  it("lead não encontrado → skipped, sem enviar", async () => {
    outboxSelect = { data: [outboxRow({ lead_id: "ghost" })], error: null }
    leadsSelect = { data: [], error: null }

    const body = await (await call()).json()
    expect(body).toMatchObject({ scanned: 1, sent: 0, skipped: 1 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({ status: "skipped" })
    expect(upd?.eqs).toMatchObject({ status: "pending" })
  })

  it("passa test_event_code quando META_CAPI_TEST_EVENT_CODE está setado", async () => {
    process.env.META_CAPI_TEST_EVENT_CODE = "TEST123"
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    await call()

    expect(sendCapiEvents).toHaveBeenCalledWith(expect.any(Array), { testEventCode: "TEST123" })
  })
})
