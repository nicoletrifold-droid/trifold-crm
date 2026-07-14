/**
 * Story 78-12 — Testes do cron de resumo mensal de billing (dedup claim-first, REL-001).
 *
 * Cobre: auth (401), guard de dia 1, envio quando o período é reivindicado com sucesso,
 * e dedup atômico: período JÁ reivindicado (conflito 23505 OU sem linha retornada) → NÃO envia.
 * O e-mail só dispara DEPOIS do claim atômico no banco (fecha a corrida entre runs concorrentes).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const sendEmailMock = vi.fn()
vi.mock("@web/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}))

// Estado configurável do banco mockado.
// claimResult: resposta do INSERT ... .select("period") em billing_monthly_summary_log.
let claimResult: { data: unknown; error: { code?: string; message?: string } | null } = {
  data: [{ period: "2026-06" }],
  error: null,
}
let snapshotRows: Record<string, unknown>[] = []
let adminRows: Record<string, unknown>[] = []

// Builder thenable: retorna a si mesmo para select/insert/eq/gte/lte e resolve conforme a tabela.
function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
      if (table === "billing_monthly_summary_log") return resolve(claimResult)
      if (table === "service_cost_snapshots") return resolve({ data: snapshotRows, error: null })
      if (table === "users") return resolve({ data: adminRows, error: null })
      return resolve({ data: null, error: null })
    },
  }
  return builder
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}))

import { NextRequest } from "next/server"
import { GET } from "./route"

function makeReq(token?: string, dry = false): NextRequest {
  const url = `https://crm.trifold.eng.br/api/cron/billing-monthly-summary${dry ? "?dry=1" : ""}`
  return new NextRequest(url, {
    method: "GET",
    headers: token !== undefined ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  // 2026-07-01 12:00 UTC = 09:00 BRT → dia 1 (America/Sao_Paulo). Período resumido = 2026-06.
  vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))
  claimResult = { data: [{ period: "2026-06" }], error: null }
  snapshotRows = []
  adminRows = [{ id: "u1", name: "Admin", email: "admin@ex.com" }]
  process.env.CRON_SECRET = "segredo"
  sendEmailMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/cron/billing-monthly-summary — dedup claim-first (REL-001)", () => {
  it("sem Bearer CRON_SECRET → 401 e não envia", async () => {
    const res = await GET(makeReq("errado"))
    expect(res.status).toBe(401)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("guard de dia 1: fora do dia 1 → skip, sem claim nem envio", async () => {
    vi.setSystemTime(new Date("2026-07-02T12:00:00Z")) // dia 2 BRT
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.skipped).toBe("not_day_1")
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("claim bem-sucedido (linha retornada) → envia o resumo aos admins", async () => {
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.period).toBe("2026-06")
    expect(json.emailsSent).toBe(1)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@ex.com", subject: "Resumo de billing — 2026-06" })
    )
  })

  it("período já reivindicado (conflito 23505) → NÃO envia (dedup)", async () => {
    claimResult = { data: null, error: { code: "23505", message: "duplicate key" } }
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.skipped).toBe("already_sent")
    expect(json.period).toBe("2026-06")
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("período já reivindicado (upsert sem linha retornada) → NÃO envia (dedup)", async () => {
    claimResult = { data: [], error: null }
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.skipped).toBe("already_sent")
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("dry-run → não reivindica nem envia (retorna prévia)", async () => {
    const res = await GET(makeReq("segredo", true))
    const json = await res.json()
    expect(json.dryRun).toBe(true)
    expect(json.period).toBe("2026-06")
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
