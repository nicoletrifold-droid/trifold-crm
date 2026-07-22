/**
 * Story 75-198 — GET /api/brokers usa a RPC get_brokers_active_lead_counts
 * (régua única do teto, sem o corte de 1000 linhas do PostgREST) em vez de
 * baixar os leads e contar em JS.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let authUser: { org_id: string } | null = { org_id: "org-1" }

let brokersData: Array<Record<string, unknown>> = []
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
let rpcCounts: Array<{ user_id: string; active_leads: number }> = []

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () =>
    authUser
      ? {
          appUser: authUser,
          supabase: {
            from: (table: string) => {
              const builder = {
                select: () => builder,
                eq: async () =>
                  table === "brokers"
                    ? { data: brokersData, error: null }
                    : { data: [], error: null },
              }
              return builder
            },
            rpc: async (fn: string, args: Record<string, unknown>) => {
              rpcCalls.push({ fn, args })
              return { data: rpcCounts, error: null }
            },
          },
        }
      : { error: new Response("unauth", { status: 401 }) },
  requireRole: async () => ({ appUser: authUser }),
}))

vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }))
vi.mock("@web/lib/email", () => ({ sendEmail: async () => ({}) }))
vi.mock("@web/lib/email-layout", () => ({ renderPasswordActionEmail: () => "" }))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  authUser = { org_id: "org-1" }
  rpcCalls = []
  brokersData = [
    { id: "b1", creci: "F-1", max_leads: 300, user: { id: "u1", name: "Robson" } },
    { id: "b2", creci: "F-2", max_leads: 400, user: { id: "u2", name: "Valeria" } },
    { id: "b3", creci: null, max_leads: 300, user: null },
  ]
  rpcCounts = [
    { user_id: "u1", active_leads: 89 },
    { user_id: "u2", active_leads: 271 },
  ]
})

describe("GET /api/brokers — contagem via RPC (Story 75-198)", () => {
  it("AC3: usa get_brokers_active_lead_counts com a org do usuário", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(rpcCalls).toEqual([
      { fn: "get_brokers_active_lead_counts", args: { p_org_id: "org-1" } },
    ])
  })

  it("AC3: mapeia active_leads_count por user_id (corretor sem linha na RPC → 0)", async () => {
    rpcCounts = [{ user_id: "u1", active_leads: 89 }]
    const res = await GET()
    const { data } = await res.json()
    const byId = Object.fromEntries(
      data.map((b: { id: string; active_leads_count: number }) => [b.id, b.active_leads_count])
    )
    expect(byId).toEqual({ b1: 89, b2: 0, b3: 0 })
  })

  it("não quebra quando a RPC devolve data null", async () => {
    rpcCounts = null as unknown as typeof rpcCounts
    const res = await GET()
    const { data } = await res.json()
    expect(data).toHaveLength(3)
    expect(data.every((b: { active_leads_count: number }) => b.active_leads_count === 0)).toBe(true)
  })

  it("sem sessão → repassa o erro do requireAuth", async () => {
    authUser = null
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
