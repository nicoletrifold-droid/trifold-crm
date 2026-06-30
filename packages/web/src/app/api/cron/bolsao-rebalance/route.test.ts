/**
 * Story 75-80 (Epic 64) — cron bolsao-rebalance.
 * Cobre: auth, gate bolsao_enabled, mover ao bolsão >= 15 min, não mover < 15 min, dry-run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

let elapsedReturn = 20
vi.mock("@web/lib/roleta/business-time", () => ({
  getOrgSchedule: async () => ({ week: [], timezone: "America/Sao_Paulo" }),
  isOpenAtNow: () => true,
  businessMinutesBetweenSchedule: () => elapsedReturn,
}))

// Estado configurável do banco mockado.
let cfgData: Array<Record<string, unknown>> = [{ org_id: "org-1", bolsao_enabled: true }]
let leadsData: Array<Record<string, unknown>> = [{ id: "L1", name: "João", assigned_broker_id: "B1" }]
let distData: Array<Record<string, unknown>> = [{ lead_id: "L1", created_at: new Date(Date.now() - 30 * 60000).toISOString() }]
const updateCaptured: Array<{ payload: unknown; ids: unknown }> = []
const activitiesInserted: Array<Record<string, unknown>> = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> & { _update?: unknown } = {
        select: () => b,
        eq: () => b,
        is: () => b,
        not: () => b,
        gte: () => b,
        update: (p: unknown) => { b._update = p; return b },
        limit: async () => ({ data: table === "leads" ? leadsData : null, error: null }),
        maybeSingle: async () => ({ data: table === "kanban_stages" ? { id: "novo-id" } : null, error: null }),
        in: (_col: string, vals: unknown) => {
          if (b._update) { updateCaptured.push({ payload: b._update, ids: vals }); return Promise.resolve({ data: null, error: null }) }
          return Promise.resolve({ data: table === "lead_distribution_log" ? distData : null, error: null })
        },
        insert: async (rows: Record<string, unknown>[]) => {
          if (table === "activities") activitiesInserted.push(...rows)
          return { data: null, error: null }
        },
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: table === "roleta_config" ? cfgData : null, error: null }),
      }
      return b
    },
  }),
}))

import { GET } from "./route"

function req(dry = false) {
  const url = `http://localhost/api/cron/bolsao-rebalance${dry ? "?dry=1" : ""}`
  return new NextRequest(url, { headers: { authorization: "Bearer test-secret" } })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "test-secret"
  elapsedReturn = 20
  cfgData = [{ org_id: "org-1", bolsao_enabled: true }]
  leadsData = [{ id: "L1", name: "João", assigned_broker_id: "B1" }]
  distData = [{ lead_id: "L1", created_at: new Date(Date.now() - 30 * 60000).toISOString() }]
  updateCaptured.length = 0
  activitiesInserted.length = 0
})

describe("GET /api/cron/bolsao-rebalance", () => {
  it("auth: sem bearer → 401", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/bolsao-rebalance"))
    expect(res.status).toBe(401)
  })

  it("move ao bolsão quando elapsed >= 15 (assigned_broker_id null + bolsao_em + activity)", async () => {
    elapsedReturn = 20
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(updateCaptured).toHaveLength(1)
    const moved = updateCaptured[0]!
    expect(moved.payload).toMatchObject({ assigned_broker_id: null })
    expect((moved.payload as Record<string, unknown>).bolsao_em).toBeTruthy()
    expect(moved.ids).toEqual(["L1"])
    expect(activitiesInserted[0]).toMatchObject({ lead_id: "L1", type: "bolsao_in" })
  })

  it("NÃO move quando elapsed < 15", async () => {
    elapsedReturn = 10
    await GET(req())
    expect(updateCaptured).toHaveLength(0)
    expect(activitiesInserted).toHaveLength(0)
  })

  it("gate: bolsao_enabled=false (não-dry) → não move", async () => {
    cfgData = [{ org_id: "org-1", bolsao_enabled: false }]
    await GET(req())
    expect(updateCaptured).toHaveLength(0)
  })

  it("dry-run: relata wouldMove, não move", async () => {
    elapsedReturn = 20
    const res = await GET(req(true))
    const body = await res.json()
    expect(updateCaptured).toHaveLength(0)
    const org = body.summary.find((s: Record<string, unknown>) => s.orgId === "org-1")
    expect(org.wouldMove).toEqual([{ lead: "L1", elapsed: 20 }])
  })
})
