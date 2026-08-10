/**
 * Story 84-1 (Epic 84) — PATCH /api/leads/[id]: gate + audit específicos da
 * Qualificação Comercial (`qualificacao_comercial`). Cobre: 403 sem
 * `leads.qualificacao` mesmo com acesso geral ao lead; 200 + persistência +
 * audit (old_value/new_value) com acesso; outros campos seguem sem exigir o
 * gate extra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let qualificacaoAccess = true
const auditCalls: Array<Record<string, unknown>> = []

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    appUser: { id: "u-1", name: "Corretor Um", role: "admin", org_id: "org-1" },
    supabase: fakeSupabase(),
  }),
}))

vi.mock("@web/lib/permissions", () => ({
  canAccess: async () => qualificacaoAccess,
}))

vi.mock("@web/lib/audit", () => ({
  logAudit: async (params: Record<string, unknown>) => {
    auditCalls.push(params)
  },
  getRequestIp: () => undefined,
}))

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase(),
}))

vi.mock("@web/lib/appointments/sync-visit-owner", () => ({
  syncFutureVisitsWithLeadOwner: async () => {},
}))

let currentLead: Record<string, unknown> = {
  assigned_broker_id: null,
  interest_level: null,
  qualificacao_comercial: null,
}
let updatedLead: Record<string, unknown> = { id: "lead-1", name: "Lead Teste" }

function fakeSupabase() {
  return {
    from: () => {
      let isUpdate = false
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => {
          isUpdate = true
          return chain
        },
        eq: () => chain,
        single: async () => {
          if (isUpdate) return { data: updatedLead, error: null }
          return { data: currentLead, error: null }
        },
      }
      return chain
    },
  }
}

import { PATCH } from "./route"

function makeRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: new Headers(),
  } as unknown as Parameters<typeof PATCH>[0]
}

beforeEach(() => {
  qualificacaoAccess = true
  auditCalls.length = 0
  currentLead = { assigned_broker_id: null, interest_level: null, qualificacao_comercial: null }
  updatedLead = { id: "lead-1", name: "Lead Teste" }
})

describe("PATCH /api/leads/[id] — qualificacao_comercial (Story 84-1)", () => {
  it("sem leads.qualificacao → 403 e não altera o lead", async () => {
    qualificacaoAccess = false
    const res = await PATCH(makeRequest({ qualificacao_comercial: "bom" }), {
      params: Promise.resolve({ id: "lead-1" }),
    })
    expect(res.status).toBe(403)
    expect(auditCalls).toHaveLength(0)
  })

  it("com leads.qualificacao → 200, persiste e audita old_value/new_value", async () => {
    currentLead.qualificacao_comercial = null
    const res = await PATCH(makeRequest({ qualificacao_comercial: "bom" }), {
      params: Promise.resolve({ id: "lead-1" }),
    })
    expect(res.status).toBe(200)

    const specificAudit = auditCalls.find((c) => c.action === "lead.qualificacao_comercial_updated")
    expect(specificAudit).toBeDefined()
    expect(specificAudit?.metadata).toEqual({ old_value: null, new_value: "bom" })

    const genericAudit = auditCalls.find((c) => c.action === "lead.update")
    expect(genericAudit).toBeDefined()
  })

  it("mudando de bom → regular audita o old_value correto", async () => {
    currentLead.qualificacao_comercial = "bom"
    const res = await PATCH(makeRequest({ qualificacao_comercial: "regular" }), {
      params: Promise.resolve({ id: "lead-1" }),
    })
    expect(res.status).toBe(200)

    const specificAudit = auditCalls.find((c) => c.action === "lead.qualificacao_comercial_updated")
    expect(specificAudit?.metadata).toEqual({ old_value: "bom", new_value: "regular" })
  })

  it("payload sem qualificacao_comercial não exige o gate nem audita a Qualificação", async () => {
    qualificacaoAccess = false
    const res = await PATCH(makeRequest({ name: "Novo Nome" }), {
      params: Promise.resolve({ id: "lead-1" }),
    })
    expect(res.status).toBe(200)
    expect(auditCalls.find((c) => c.action === "lead.qualificacao_comercial_updated")).toBeUndefined()
  })
})
