import { describe, it, expect, vi } from "vitest"

vi.mock("@web/lib/roleta/business-time", () => ({
  getOrgSchedule: vi.fn(async () => ({ week: {}, timezone: "America/Sao_Paulo" })),
  // Mock determinístico: "minutos comerciais" = diff simples em minutos.
  businessMinutesBetweenSchedule: vi.fn((from: Date, to: Date) =>
    Math.round((to.getTime() - from.getTime()) / 60000),
  ),
}))
vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))

import { computeWaitingMinutes, AGUARDANDO_STAGE_ID } from "./waiting"

type DistRow = { lead_id: string; created_at: string }

function makeAdmin(distRows: DistRow[]) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.in = vi.fn(() => Promise.resolve({ data: distRows, error: null }))
  return { from: vi.fn(() => chain) } as never
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const minsAhead = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

describe("computeWaitingMinutes (Story 75-49/75-91)", () => {
  it("retorna {} sem leads (não consulta o banco)", async () => {
    const admin = makeAdmin([])
    expect(await computeWaitingMinutes(admin, "org", [])).toEqual({})
  })

  it("conta os minutos desde a distribuição", async () => {
    const admin = makeAdmin([{ lead_id: "a", created_at: minsAgo(10) }])
    const r = await computeWaitingMinutes(admin, "org", ["a"])
    expect(r.a).toBeGreaterThanOrEqual(9)
    expect(r.a).toBeLessThanOrEqual(11)
  })

  it("usa a distribuição MAIS RECENTE quando há várias", async () => {
    const admin = makeAdmin([
      { lead_id: "a", created_at: minsAgo(30) },
      { lead_id: "a", created_at: minsAgo(5) },
    ])
    const r = await computeWaitingMinutes(admin, "org", ["a"])
    expect(r.a).toBeGreaterThanOrEqual(4)
    expect(r.a).toBeLessThanOrEqual(6)
  })

  it("ignora distribuição no futuro (omite o lead)", async () => {
    const admin = makeAdmin([{ lead_id: "a", created_at: minsAhead(10) }])
    const r = await computeWaitingMinutes(admin, "org", ["a"])
    expect(r.a).toBeUndefined()
  })

  it("omite lead sem distribuição registrada", async () => {
    const admin = makeAdmin([{ lead_id: "a", created_at: minsAgo(3) }])
    const r = await computeWaitingMinutes(admin, "org", ["a", "b"])
    expect(r.a).toBeDefined()
    expect(r.b).toBeUndefined()
  })

  it("expõe o id da etapa Aguardando atendimento", () => {
    expect(AGUARDANDO_STAGE_ID).toBe("00000000-0000-0000-0001-000000000001")
  })
})
