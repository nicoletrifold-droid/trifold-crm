// Story 75-229 — marketingGuard() migrou de requireRole(["admin","supervisor"])
// para canAccess("campanhas.agente") (matriz de permissões). Testa os 2
// caminhos: acesso negado (403) e acesso concedido (retorna admin/supabase/appUser).

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let canAccessResult = false

vi.mock("@web/lib/permissions", () => ({
  canAccess: async () => canAccessResult,
}))

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ __isAdminClient: true }),
}))

const mockSupabase = { __isUserClient: true }
let authResult: { supabase: unknown; appUser: unknown; user: { id: string } } | { error: unknown } = {
  supabase: mockSupabase,
  appUser: { id: "u1", role: "broker", org_id: "org1" },
  user: { id: "u1" },
}

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => authResult,
}))

import { marketingGuard } from "./guard"

beforeEach(() => {
  vi.clearAllMocks()
  canAccessResult = false
  authResult = {
    supabase: mockSupabase,
    appUser: { id: "u1", role: "broker", org_id: "org1" },
    user: { id: "u1" },
  }
})

describe("marketingGuard", () => {
  it("retorna 403 quando canAccess('campanhas.agente') é false", async () => {
    canAccessResult = false
    const result = await marketingGuard()
    expect(result.error).toBeDefined()
    if (result.error) {
      expect(result.error.status).toBe(403)
    }
  })

  it("retorna admin/supabase/appUser quando canAccess('campanhas.agente') é true", async () => {
    canAccessResult = true
    const result = await marketingGuard()
    expect(result.error).toBeUndefined()
    if (!result.error) {
      expect(result.admin).toEqual({ __isAdminClient: true })
      expect(result.supabase).toBe(mockSupabase)
      expect(result.appUser).toEqual({ id: "u1", role: "broker", org_id: "org1" })
    }
  })

  it("propaga o erro de requireAuth sem chamar canAccess", async () => {
    const unauthorized = { status: 401 }
    authResult = { error: unauthorized }
    const result = await marketingGuard()
    expect(result.error).toBeDefined()
    if (result.error) {
      expect(result.error).toBe(unauthorized)
    }
  })
})
