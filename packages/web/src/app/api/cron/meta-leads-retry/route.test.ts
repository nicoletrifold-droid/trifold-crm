/**
 * Story 75-214 — cron de retry de leadgen não processado.
 * Cobre: auth, política de idade (side effects × recuperação tardia),
 * contador de tentativas em processing_error e skip de evento de teste.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const processMetaLead = vi.fn(async () => ({ ok: true, leadId: "lead-x" }))
vi.mock("@web/lib/meta/process-lead", () => ({
  processMetaLead: (...args: unknown[]) => (processMetaLead as (...a: unknown[]) => unknown)(...args),
}))

type Result = { data: unknown; error: unknown }
let selectResult: Result = { data: [], error: null }
let updates: Array<{ payload: unknown; id: string | null }> = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      let pendingUpdate: unknown = null
      for (const m of ["select", "lt", "gt", "order", "limit"]) b[m] = vi.fn(() => b)
      b.eq = vi.fn((col: string, val: unknown) => {
        if (pendingUpdate && col === "id") updates.push({ payload: pendingUpdate, id: val as string })
        return b
      })
      b.update = vi.fn((payload: unknown) => {
        pendingUpdate = payload
        return b
      })
      b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(pendingUpdate ? { data: null, error: null } : selectResult).then(res, rej)
      return b
    },
  }),
}))

process.env.CRON_SECRET = "test-secret"
const { GET } = await import("./route")

function call(auth: string | null = "Bearer test-secret") {
  return GET(
    new Request("https://x/api/cron/meta-leads-retry", {
      headers: auth ? { authorization: auth } : {},
    }) as never,
  )
}

const HOUR = 60 * 60 * 1000
function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    created_at: new Date(Date.now() - 1 * HOUR).toISOString(),
    leadgen_id: "12345",
    processing_error: null,
    payload: {
      entry: [
        {
          id: "page-1",
          changes: [{ field: "leadgen", value: { leadgen_id: "12345", form_id: "f1" } }],
        },
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  selectResult = { data: [], error: null }
})

describe("GET /api/cron/meta-leads-retry", () => {
  it("sem secret → 401", async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call("Bearer errado")).status).toBe(401)
  })

  it("evento fresco (< 6h) → fluxo completo com side effects", async () => {
    selectResult = { data: [event()], error: null }

    const res = await call()
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, recovered: 1, failed: 0 })
    expect(processMetaLead).toHaveBeenCalledWith(
      "12345",
      expect.objectContaining({ leadgen_id: "12345" }),
      expect.objectContaining({ id: "page-1" }),
      "log-1",
      { sideEffects: true, backdateTo: undefined },
    )
  })

  it("evento antigo (≥ 6h) → recuperação tardia sem side effects e com backdate", async () => {
    const oldCreatedAt = new Date(Date.now() - 48 * HOUR).toISOString()
    selectResult = { data: [event({ created_at: oldCreatedAt })], error: null }

    await call()

    expect(processMetaLead).toHaveBeenCalledWith(
      "12345",
      expect.anything(),
      expect.anything(),
      "log-1",
      { sideEffects: false, backdateTo: oldCreatedAt },
    )
  })

  it("falha → incrementa contador em processing_error; 3/3 → não tenta mais", async () => {
    processMetaLead.mockResolvedValueOnce({ ok: false, error: "Graph API error 400" } as never)
    selectResult = {
      data: [
        event({ id: "log-a", processing_error: "retry 1/3: x" }),
        event({ id: "log-b", processing_error: "retry 3/3: esgotado" }),
      ],
      error: null,
    }

    const res = await call()
    const body = await res.json()

    expect(body).toMatchObject({ failed: 1, skipped: 1 })
    expect(processMetaLead).toHaveBeenCalledTimes(1)
    expect(updates).toContainEqual({
      payload: expect.objectContaining({ processing_error: "retry 2/3: Graph API error 400" }),
      id: "log-a",
    })
  })

  it("evento de teste (leadgen_id não numérico) → marca processed sem processar", async () => {
    selectResult = { data: [event({ leadgen_id: "form-name-test-1" })], error: null }

    const res = await call()
    const body = await res.json()

    expect(body).toMatchObject({ skipped: 1 })
    expect(processMetaLead).not.toHaveBeenCalled()
    expect(updates).toContainEqual({
      payload: expect.objectContaining({ processed: true, processing_error: "test_event_skipped" }),
      id: "log-1",
    })
  })

  it("lead já existia (deduped) → conta como dedup, não como recovered", async () => {
    processMetaLead.mockResolvedValueOnce({ ok: true, leadId: "l", deduped: true } as never)
    selectResult = { data: [event()], error: null }

    const body = await (await call()).json()
    expect(body).toMatchObject({ recovered: 0, deduped: 1 })
  })
})
