/**
 * Story 75-80 + 75-82 (Epic 64) — cron bolsao-rebalance.
 * Cobre: auth, gate, mover >= 15min, não mover < 15min, dry-run, e o resumo (digest) à Fernanda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

let elapsedReturn = 20
/** Story 900-23 · AC7 — orgs cuja resolução de agenda deve lançar (isolamento de erro). */
let orgsQueFalham = new Set<string>()
vi.mock("@web/lib/roleta/business-time", () => ({
  getOrgSchedule: async (orgId: string) => {
    if (orgsQueFalham.has(orgId)) throw new Error(`falha sintética na agenda da ${orgId}`)
    return { week: [], timezone: "America/Sao_Paulo" }
  },
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
// Story 75-109: digest vai para usuários role='gerente-comercial' (query em lista).
let gerentesData: Array<Record<string, unknown>> = [{ id: "g1", name: "Fernanda", phone: "5518999999999" }]
let wppConfig: Record<string, unknown> | null = { phone_number_id: "111", access_token: "tok" }
let claimResult: boolean | null = true
const updateCaptured: Array<{ payload: unknown; ids: unknown }> = []
const activitiesInserted: Array<Record<string, unknown>> = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (_fn: string, _args: unknown) => { void _fn; void _args; return { data: claimResult, error: null } },
    from: (table: string) => {
      let cols = ""
      // Story 75-286: o mock precisa APLICAR o `.is(col, null)` (não só engolir), senão
      // o teste do lead "fantasma" passaria mesmo sem o fix no cron.
      const isNullCols: string[] = []
      const b: Record<string, unknown> & { _update?: unknown } = {
        select: (c: string) => { cols = c ?? ""; return b },
        eq: () => b, not: () => b, gte: () => b,
        is: (col: string) => { isNullCols.push(col); return b },
        update: (p: unknown) => { b._update = p; return b },
        limit: async () => {
          if (table === "leads") {
            const isPool = cols.includes("bolsao_em") && !cols.includes("assigned_broker_id")
            if (!isPool) return { data: leadsData, error: null }
            const rows = isNullCols.includes("assigned_broker_id")
              ? poolData.filter((l) => l.assigned_broker_id == null)
              : poolData
            return { data: rows, error: null }
          }
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
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: table === "roleta_config" ? cfgData : table === "users" ? gerentesData : null, error: null }),
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
  orgsQueFalham = new Set()
  cfgData = [{ ...CFG }]
  leadsData = [{ id: "L1", name: "João", assigned_broker_id: "B1" }]
  distData = [{ lead_id: "L1", created_at: new Date(Date.now() - 30 * 60000).toISOString() }]
  poolData = []
  gestorUser = { name: "Fernanda", phone: "5518999999999" }
  gerentesData = [{ id: "g1", name: "Fernanda", phone: "5518999999999" }]
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

  // Story 75-286 — regressão do incidente de 05/08: o gerente recebeu 6 avisos em 3h
  // ("Há 1 lead(s) parado(s) no bolsão") por um lead atendido em 1min22s. O painel
  // (75-89) já filtrava `assigned_broker_id is null`; o cron não → contava o lead
  // "fantasma" (bolsao_em sujo + dono definido por /assign) para sempre.
  it("digest ignora lead 'fantasma': bolsao_em preenchido MAS já tem dono → count 0, nada enviado", async () => {
    leadsData = []
    poolData = [{ bolsao_em: new Date().toISOString(), assigned_broker_id: "B1" }]
    const res = await GET(req())
    const body = (await res.json()) as { summary: Array<{ digestCount: number; digestSent: boolean }> }
    expect(body.summary[0]!.digestCount).toBe(0)
    expect(body.summary[0]!.digestSent).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it("digest conta lead do pool real: sem dono há >= 15min de expediente", async () => {
    leadsData = []
    poolData = [
      { bolsao_em: new Date().toISOString(), assigned_broker_id: null }, // pool real → conta
      { bolsao_em: new Date().toISOString(), assigned_broker_id: "B1" }, // fantasma → não conta
    ]
    const res = await GET(req())
    const body = (await res.json()) as { summary: Array<{ digestCount: number; digestSent: boolean }> }
    expect(body.summary[0]!.digestCount).toBe(1)
    expect(body.summary[0]!.digestSent).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(1)
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-23 · AC7 — isolamento de erro por organização
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("bolsao-rebalance — isolamento de erro por org (AC7 da 900-23)", () => {
  const CFG_B = { ...CFG, org_id: "org-2" }

  it("controle positivo: 2 orgs, as 2 no summary com `ok: true`", async () => {
    cfgData = [{ ...CFG }, { ...CFG_B }]
    const res = await GET(req())
    const body = (await res.json()) as {
      ok: boolean
      summary: Array<{ orgId: string; ok?: boolean }>
    }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary.map((s) => s.orgId)).toEqual(["org-1", "org-2"])
    expect(body.summary.every((s) => s.ok === true)).toBe(true)
  })

  it("🔴 erro na 1ª org NÃO impede a 2ª, e a org que falhou CONTINUA no array com `ok: false`", async () => {
    // O `try/catch` que já existia era na FOLHA (envio de WhatsApp). Este é o do laço de orgs:
    // sem ele, a exceção aqui aborta o cron inteiro e a org-2 fica sem rebalanceamento.
    cfgData = [{ ...CFG }, { ...CFG_B }]
    orgsQueFalham = new Set(["org-1"])

    const res = await GET(req())
    const body = (await res.json()) as {
      ok: boolean
      summary: Array<{ orgId: string; ok?: boolean; erro?: string }>
    }

    expect(res.status).toBe(200)
    const a = body.summary.find((s) => s.orgId === "org-1")!
    const b = body.summary.find((s) => s.orgId === "org-2")!
    // A org-1 não sumiu do relatório — e diz por quê.
    expect(a.ok).toBe(false)
    expect(a.erro).toContain("falha sintética")
    // A org-2 foi processada normalmente.
    expect(b.ok).toBe(true)
    expect(body.ok).toBe(false)
  })
})
