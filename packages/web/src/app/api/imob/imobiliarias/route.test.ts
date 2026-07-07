/**
 * Story 75-148 — GET /api/imob/imobiliarias + guard compartilhado (imobiliariasGuard).
 * Cobre: gestor de Pastas SEM acesso ao módulo IMOB consegue listar (base compartilhada);
 * corretor sem nenhum dos dois → 403; acesso via IMOB também libera.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "admin"
let imobAccess = true

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    appUser: { id: "u-1", name: "User", role, org_id: "org-1" },
  }),
}))

vi.mock("@web/lib/permissions", () => ({
  canAccess: async () => imobAccess,
}))

const listData = [{ id: "i-1", nome: "Imob A", cnpj: null, cidade: "Londrina", estado: "PR", status: "ativo" }]
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: async () => ({ data: listData, error: null }),
      }
      return b
    },
  }),
}))

import { GET } from "./route"

beforeEach(() => {
  role = "admin"
  imobAccess = true
})

describe("GET /api/imob/imobiliarias (guard compartilhado — Story 75-148)", () => {
  it("com acesso ao IMOB → lista", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.imobiliarias).toHaveLength(1)
    expect(json.imobiliarias[0].nome).toBe("Imob A")
  })

  it("gestor de Pastas SEM acesso ao IMOB → lista (base compartilhada)", async () => {
    imobAccess = false
    role = "supervisor" // isPastaManager = true
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.imobiliarias).toHaveLength(1)
  })

  it("corretor (sem IMOB e sem Pastas) → 403", async () => {
    imobAccess = false
    role = "corretor"
    const res = await GET()
    expect(res.status).toBe(403)
  })
})
