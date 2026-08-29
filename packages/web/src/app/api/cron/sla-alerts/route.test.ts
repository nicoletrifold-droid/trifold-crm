/**
 * Story 900-23 · AC7 — isolamento de erro por organização no `sla-alerts`.
 *
 * O `try/catch` que já existia era **na folha** (o envio de WhatsApp ao gestor). O laço de orgs
 * (`for (const cfg of configs)`) não tinha nenhum: uma exceção resolvendo a agenda da org A
 * abortava o laço e a org B ficava sem alerta de SLA na rodada.
 *
 * ⚠️ Campo de falha NOMEADO (C10): o retorno é `{ ok, summary: [] }`, um array de entradas por org
 * — **não** um contador. Por isso a org que falha aparece no array com `ok: false` e a mensagem,
 * em vez de sumir dele. Sumir do array é a versão "erra em silêncio" deste padrão.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

let orgsQueFalham = new Set<string>()
let configs: Array<Record<string, unknown>> = []

vi.mock("@web/lib/roleta/business-time", () => ({
  getOrgSchedule: async (orgId: string) => {
    if (orgsQueFalham.has(orgId)) throw new Error(`falha sintética na agenda da org ${orgId}`)
    return { week: [], timezone: "America/Sao_Paulo" }
  },
  isOpenAtNow: () => true,
  businessMinutesBetweenSchedule: () => 5,
}))

vi.mock("@web/lib/server/push-service", () => ({ sendPushToUser: vi.fn() }))
vi.mock("@web/lib/whatsapp/log-send", () => ({ logWhatsappSend: vi.fn() }))

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const b: Record<string, unknown> = {}
      let pendingUpdate: unknown = null
      for (const m of ["select", "eq", "not", "gte", "is", "or", "order", "limit"]) b[m] = () => b
      b.update = (p: unknown) => {
        pendingUpdate = p
        return b
      }
      b.in = async () => ({ data: [], error: null })
      b.maybeSingle = async () =>
        tabela === "kanban_stages" ? { data: { id: "novo-id" }, error: null } : { data: null, error: null }
      b.then = (res: (v: unknown) => unknown) => {
        if (pendingUpdate) return Promise.resolve({ data: null, error: null }).then(res)
        return Promise.resolve({
          data: tabela === "roleta_config" ? configs : [],
          error: null,
        }).then(res)
      }
      return b
    },
  }),
}))

function cfg(orgId: string) {
  return {
    org_id: orgId,
    sla_alertas_enabled: true,
    bolsao_enabled: true,
    sla_alerta_corretor_min: 30,
    sla_alerta_gestor_min: 60,
    notify_user_on_fora_horario: null,
    notify_user_on_distribution: null,
    business_days: null,
    business_hour_start: null,
    business_hour_end: null,
    weekend_hour_start: null,
    weekend_hour_end: null,
    timezone: null,
  }
}

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  orgsQueFalham = new Set()
  configs = [cfg(ORG_A), cfg(ORG_B)]
})

async function chamar() {
  const { GET } = await import("./route")
  return GET(
    new Request("https://x.test/api/cron/sla-alerts", {
      headers: { authorization: "Bearer segredo" },
    }) as never,
  )
}

type Corpo = { ok: boolean; summary: Array<{ orgId: string; ok?: boolean; erro?: string }> }

describe("sla-alerts — isolamento de erro por org (AC7)", () => {
  it("controle positivo: as duas orgs entram no summary com `ok: true`", async () => {
    const res = await chamar()
    const body = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary.map((s) => s.orgId)).toEqual([ORG_A, ORG_B])
    expect(body.summary.every((s) => s.ok === true)).toBe(true)
  })

  it("🔴 erro na 1ª org NÃO impede a 2ª, e a org que falhou CONTINUA no array com `ok: false`", async () => {
    orgsQueFalham = new Set([ORG_A])

    const res = await chamar()
    const body = (await res.json()) as Corpo

    expect(res.status).toBe(200)
    // A org B foi processada.
    const b = body.summary.find((s) => s.orgId === ORG_B)!
    expect(b.ok).toBe(true)
    // A org A não sumiu do relatório — e diz por quê.
    const a = body.summary.find((s) => s.orgId === ORG_A)!
    expect(a.ok).toBe(false)
    expect(a.erro).toContain("falha sintética")
    // E o `ok` do topo não fica limpo.
    expect(body.ok).toBe(false)
  })
})
