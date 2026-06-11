/**
 * Meta Lead Ads webhook → roleta distribution tests — Story 46-2
 *
 * Verifies the invariant that `distributeLeadToNextBroker` is called ONLY for
 * brand-new leads (the `insert` path, where `assigned_broker_id IS NULL` by
 * construction — ADR-001 precedence: human > roleta > pipeline) and NEVER for
 * existing leads (the `update` path that only touches metadata/utm).
 *
 * Strategy: build a minimal in-memory Supabase mock for the chain methods the
 * route uses, mock the distributor + automations, and force `after()` to run
 * synchronously so we can observe the fire-and-forget side effects.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

// ---- Mocks ----------------------------------------------------------------

// Run `after()` callbacks eagerly so processLeadAsync executes within the test.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>(
    "next/server"
  )
  return {
    ...actual,
    after: (fn: () => Promise<unknown> | unknown) => {
      void Promise.resolve().then(() => fn())
    },
  }
})

const distributeMock = vi.fn<
  (leadId: string, orgId: string) => Promise<{ status: string }>
>()
vi.mock("@web/lib/roleta/distributor", () => ({
  distributeLeadToNextBroker: (leadId: string, orgId: string) =>
    distributeMock(leadId, orgId),
}))

const triggerAutomationsMock = vi.fn()
vi.mock("@web/lib/email-automations", () => ({
  triggerAutomations: (...args: unknown[]) => triggerAutomationsMock(...args),
}))

// ---- In-memory Supabase mock ---------------------------------------------

interface LeadRow {
  id: string
  org_id: string
  phone: string | null
  utm_campaign: string | null
  assigned_broker_id: string | null
  metadata?: Record<string, unknown> | null
}

interface DbState {
  leads: LeadRow[]
  kanban_stages: Array<{ id: string; org_id: string; is_default: boolean; position: number }>
  whatsapp_config: Array<{ org_id: string; status: string }>
  activities: Array<Record<string, unknown>>
  webhook_logs: Array<Record<string, unknown>>
}

let db: DbState
let nextId = 0

function freshDb(): DbState {
  return {
    leads: [],
    kanban_stages: [{ id: "stage-default", org_id: "org-1", is_default: true, position: 0 }],
    whatsapp_config: [{ org_id: "org-1", status: "active" }],
    activities: [],
    webhook_logs: [],
  }
}

// Minimal chainable Supabase-like client covering only what the route uses.
function buildSupabaseMock() {
  function from(table: keyof DbState) {
    const filters: Array<{ col: string; val: unknown }> = []
    let orderCol: string | null = null
    let limitN: number | null = null

    const applyFilters = (rows: Record<string, unknown>[]) =>
      rows.filter((r) => filters.every((f) => r[f.col] === f.val))

    const builder = {
      select() {
        return builder
      },
      eq(col: string, val: unknown) {
        filters.push({ col, val })
        return builder
      },
      order(col: string) {
        orderCol = col
        return builder
      },
      limit(n: number) {
        limitN = n
        return builder
      },
      async single() {
        let rows = applyFilters(db[table] as unknown as Record<string, unknown>[])
        if (orderCol) {
          rows = [...rows].sort(
            (a, b) => (a[orderCol!] as number) - (b[orderCol!] as number)
          )
        }
        if (limitN != null) rows = rows.slice(0, limitN)
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows" } }
      },
      insert(payload: Record<string, unknown>) {
        const row = { id: `lead-${++nextId}`, ...payload }
        ;(db[table] as unknown as Record<string, unknown>[]).push(row)
        return {
          select() {
            return {
              async single() {
                return { data: { id: row.id }, error: null }
              },
            }
          },
          async then(resolve: (v: { data: null; error: null }) => void) {
            resolve({ data: null, error: null })
          },
        }
      },
      update(payload: Record<string, unknown>) {
        return {
          eq(col: string, val: unknown) {
            const rows = (db[table] as unknown as Record<string, unknown>[]).filter(
              (r) => r[col] === val
            )
            rows.forEach((r) => Object.assign(r, payload))
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    }
    return builder
  }
  return { from }
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => buildSupabaseMock(),
}))

// ---- Helpers --------------------------------------------------------------

function signedRequest(payload: unknown, appSecret: string) {
  const raw = JSON.stringify(payload)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto")
  const sig =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex")

  const req = new Request("http://localhost/api/webhooks/meta-ads", {
    method: "POST",
    headers: {
      "x-hub-signature-256": sig,
      "content-type": "application/json",
    },
    body: raw,
  })
  return req as unknown as import("next/server").NextRequest
}

// Build a Meta webhook payload with inline field_data (sandbox path — no Graph API call).
function buildLeadPayload(opts: { phone: string; name?: string; email?: string }) {
  return {
    entry: [
      {
        id: "page-1",
        changes: [
          {
            value: {
              leadgen_id: `lg-${opts.phone}`,
              field_data: [
                { name: "full_name", values: [opts.name ?? "Lead Teste"] },
                { name: "email", values: [opts.email ?? "lead@test.com"] },
                { name: "phone_number", values: [opts.phone] },
              ],
            },
          },
        ],
      },
    ],
  }
}

async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

// ---- Tests ----------------------------------------------------------------

describe("Meta webhook → roleta — Story 46-2", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    distributeMock.mockClear()
    distributeMock.mockResolvedValue({ status: "distributed" })
    triggerAutomationsMock.mockClear()
    process.env.META_APP_SECRET = APP_SECRET
  })

  it("AC1 — lead NOVO → distributeLeadToNextBroker é chamado (1x) com (leadId, orgId)", async () => {
    const { POST } = await import("../route")
    const res = await POST(signedRequest(buildLeadPayload({ phone: "5511999990001" }), APP_SECRET))
    expect(res.status).toBe(200)

    await flushAsync()

    expect(distributeMock).toHaveBeenCalledTimes(1)
    const call = distributeMock.mock.calls[0]
    expect(call).toBeDefined()
    const [leadId, orgId] = call!
    expect(orgId).toBe("org-1")
    expect(db.leads.find((l) => l.id === leadId)).toBeTruthy()
  })

  it("AC2 — lead EXISTENTE (update de metadata) → roleta NÃO é chamada", async () => {
    // Seed an existing lead with the same phone (already has a broker).
    db.leads.push({
      id: "lead-existing",
      org_id: "org-1",
      phone: "5511999990002",
      utm_campaign: "old-campaign",
      assigned_broker_id: "broker-7",
      metadata: null,
    })

    const { POST } = await import("../route")
    const res = await POST(signedRequest(buildLeadPayload({ phone: "5511999990002" }), APP_SECRET))
    expect(res.status).toBe(200)

    await flushAsync()

    expect(distributeMock).not.toHaveBeenCalled()
    // Existing lead keeps its broker — no overwrite.
    expect(db.leads.find((l) => l.id === "lead-existing")?.assigned_broker_id).toBe("broker-7")
  })

  it("AC3 — lead NOVO fora do horário → roleta chamada (status fora_horario), sem erro no webhook", async () => {
    distributeMock.mockResolvedValue({ status: "fora_horario" })

    const { POST } = await import("../route")
    const res = await POST(signedRequest(buildLeadPayload({ phone: "5511999990003" }), APP_SECRET))
    expect(res.status).toBe(200)

    await flushAsync()

    expect(distributeMock).toHaveBeenCalledTimes(1)
  })

  it("AC4 — distributeLeadToNextBroker lança → erro capturado, webhook não falha, lead criado", async () => {
    distributeMock.mockRejectedValue(new Error("RPC boom"))

    const { POST } = await import("../route")
    const res = await POST(signedRequest(buildLeadPayload({ phone: "5511999990004" }), APP_SECRET))
    expect(res.status).toBe(200)

    // Should not throw despite the rejected distribution promise.
    await expect(flushAsync()).resolves.toBeUndefined()

    expect(distributeMock).toHaveBeenCalledTimes(1)
    // Lead still created (insert path ran before distribution).
    expect(db.leads.some((l) => l.phone === "5511999990004")).toBe(true)
  })
})
