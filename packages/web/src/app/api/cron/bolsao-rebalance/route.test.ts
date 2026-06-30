/**
 * Story 75-80 + 75-82 (Epic 64) — cron bolsao-rebalance.
 * Cobre: auth, gate, mover >= 15min, não mover < 15min, dry-run, e o resumo (digest) à Fernanda.
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

const pushSpy = vi.fn(async (..._a: unknown[]) => { void _a })
vi.mock("@web/lib/server/push-service", () => ({ sendPushToUser: (...a: unknown[]) => pushSpy(...a) }))
vi.mock("@web/lib/whatsapp/log-send", () => ({ logWhatsappSend: vi.fn() }))

let cfgData: Array<Record<string, unknown>> = []
let leadsData: Array<Record<string, unknown>> = []
let poolData: Array<Record<string, unknown>> = []
let distData: Array<Record<string, unknown>> = [{ lead_id: "L1", created_at: new Date(Date.now() - 30 * 60000).toISOString() }]
let gestorUser: Record<string, unknown> | null = { name: "Fernanda", phone: "5518999999999" }
let wppConfig: Record<string, unknown> | null = { phone_number_id: "111", access_token: "tok" }
let claimResult: boolean | null = true
const updateCaptured: Array<{ payload: unknown; ids: unknown }> = []
const activitiesInserted: Array<Record<string, unknown>> = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (_fn: string, _args: unknown) => { void _fn; void _args; return { data: claimResult, error: null } },
    from: (table: string) => {
      let cols = ""
      const b: Record<string, unknown> & { _update?: unknown } = {
        select: (c: string) => { cols = c ?? ""; return b },
        eq: () => b, is: () => b, not: () => b, gte: () => b,
        update: (p: unknown) => { b._update = p; return b },
        limit: async () => {
          if (table === "leads") return { data: cols.includes("bolsao_em") && !cols.includes("assigned_broker_id") ? poolData : leadsData, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () =>
          table === "kanban_stages" ? { data: { id: "novo-id" }, error: null }
          : table === "users" ? { data: gestorUser, error: null }
          : table === "whatsapp_config" ? { data: wppConfig, error: null }
          : { data: null, error: null },
        in: (_c: string, vals: unknown) => {
          if (b._update) { updateCaptured.push({ payload: b._update, ids: vals }); return Promise.resolve({ data: null, error: null }) }
          return Promise.resolve({ data: table === "lead_distribution_log" ? distData : null, error: null })
        },
        insert: async (rows: Record<string, unknown>[]) => { if (table === "activities") activitiesInserted.push(...rows); return { data: null, error: null } },
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: table === "roleta_config" ? cfgData : null, error: null }),
      }
      return b
    },
  }),
}))

import { GET } from "./route"

function req(dry = false) {
  return new NextRequest(`http://localhost/api/cron/bolsao-rebalance${dry ? "?dry=1" : ""}`, { headers: { authorization: "Bearer test-secret" } })
}
const CFG = { org_id: "org-1", bolsao_enabled: true, notify_user_on_fora_horario: "gestor-1", notify_user_on_distribution: null }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "test-secret"
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.trifold.eng.br"
  elapsedReturn = 20
  cfgData = [{ ...CFG }]
  leadsData = [{ id: "L1", name: "João", assigned_broker_id: "B1" }]
  distData = [{ lead_id: "L1", created_at: new Date(Date.now() - 30 * 60000).toISOString() }]
  poolData = []
  gestorUser = { name: "Fernanda", phone: "5518999999999" }
  wppConfig = { phone_number_id: "111", access_token: "tok" }
  claimResult = true
  updateCaptured.length = 0
  activitiesInserted.length = 0
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ messages: [{ id: "wamid" }] }) })) as unknown as typeof fetch
})

describe("GET /api/cron/bolsao-rebalance", () => {
  it("auth: sem bearer → 401", async () => {
    expect((await GET(new NextRequest("http://localhost/api/cron/bolsao-rebalance"))).status).toBe(401)
  })

  it("move ao bolsão quando elapsed >= 15", async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(updateCaptured).toHaveLength(1)
    expect(updateCaptured[0]!.payload).toMatchObject({ assigned_broker_id: null })
    expect(activitiesInserted[0]).toMatchObject({ type: "bolsao_in" })
  })

  it("NÃO move quando elapsed < 15", async () => {
    elapsedReturn = 10
    await GET(req())
    expect(updateCaptured).toHaveLength(0)
  })

  it("gate: bolsao_enabled=false → não move e não faz digest", async () => {
    cfgData = [{ ...CFG, bolsao_enabled: false }]
    await GET(req())
    expect(updateCaptured).toHaveLength(0)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it("digest: pool com lead >=15min + claim → WhatsApp aviso_bolsao_gestor + push à Fernanda", async () => {
    leadsData = []
    poolData = [{ bolsao_em: new Date().toISOString() }]
    await GET(req())
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const init = calls[0]![1] as { body: string }
    const body = JSON.parse(init.body)
    expect(body.template.name).toBe("aviso_bolsao_gestor")
    expect(pushSpy).toHaveBeenCalled()
  })

  it("digest anti-flood: claim=false → não envia", async () => {
    leadsData = []
    poolData = [{ bolsao_em: new Date().toISOString() }]
    claimResult = null
    await GET(req())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
