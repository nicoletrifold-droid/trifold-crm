/**
 * Story 84-2 (Epic 84) — GET /api/leads/[id]/qualificacao-historico. Cobre: 403 sem
 * `leads.qualificacao`; 404 quando o lead não é visível pelo client RLS-scoped do usuário
 * (SEC-001 — corretor sem relação com o lead, sem tocar o admin client); 200 com a lista
 * mapeada de `audit_logs` (via admin client, não o client RLS-scoped — `audit_logs`
 * restringe SELECT a role='admin', ver 059_audit_logs.sql).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let qualificacaoAccess = true
let leadVisibleToUser = true
let adminClientCalls = 0

const rlsScopedSupabase = {
  from: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({
        data: leadVisibleToUser ? { id: "lead-1" } : null,
        error: leadVisibleToUser ? null : { message: "not found" },
      }),
    }
    return chain
  },
}

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    appUser: { id: "u-1", name: "User", org_id: "org-1" },
    supabase: rlsScopedSupabase,
  }),
}))

vi.mock("@web/lib/permissions", () => ({
  canAccess: async () => qualificacaoAccess,
}))

const auditRows = [
  {
    id: "log-2",
    user_name: "Gestora Ana",
    created_at: "2026-08-05T10:00:00Z",
    metadata: { old_value: "bom", new_value: "regular" },
  },
  {
    id: "log-1",
    user_name: "Corretor Bruno",
    created_at: "2026-08-04T10:00:00Z",
    metadata: { old_value: null, new_value: "bom" },
  },
]

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => {
    adminClientCalls++
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: auditRows, error: null }),
    }
    return { from: () => chain }
  },
}))

import { GET } from "./route"

beforeEach(() => {
  qualificacaoAccess = true
  leadVisibleToUser = true
  adminClientCalls = 0
})

describe("GET /api/leads/[id]/qualificacao-historico (Story 84-2)", () => {
  it("sem leads.qualificacao → 403, sem tocar o admin client", async () => {
    qualificacaoAccess = false
    const res = await GET({} as never, { params: Promise.resolve({ id: "lead-1" }) })
    expect(res.status).toBe(403)
    expect(adminClientCalls).toBe(0)
  })

  it("SEC-001 — lead não visível pelo client RLS-scoped (corretor sem relação com o lead) → 404, sem tocar o admin client", async () => {
    leadVisibleToUser = false
    const res = await GET({} as never, { params: Promise.resolve({ id: "lead-de-outro-corretor" }) })
    expect(res.status).toBe(404)
    expect(adminClientCalls).toBe(0)
  })

  it("com leads.qualificacao e lead visível → 200, usa o admin client e mapeia old_value/new_value", async () => {
    const res = await GET({} as never, { params: Promise.resolve({ id: "lead-1" }) })
    expect(res.status).toBe(200)
    expect(adminClientCalls).toBe(1)

    const json = await res.json()
    expect(json.historico).toHaveLength(2)
    expect(json.historico[0]).toEqual({
      id: "log-2",
      user_name: "Gestora Ana",
      created_at: "2026-08-05T10:00:00Z",
      old_value: "bom",
      new_value: "regular",
    })
  })
})
