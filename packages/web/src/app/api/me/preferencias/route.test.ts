/**
 * Story 75-210 — preferências self-service do usuário logado.
 * PATCH grava só a coluna allowlisted na PRÓPRIA linha (via admin client,
 * pois a RLS de users não dá UPDATE a supervisor).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let prefValue: boolean | null = true
const updates: { payload: Record<string, unknown>; filters: Record<string, unknown> }[] = []

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: {
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          single: async () => ({
            data: { notif_obra_aprovacao_email: prefValue },
            error: null,
          }),
        }
        return b
      },
    },
    appUser: { id: "sup-1", name: "Robson", role: "supervisor", org_id: "org-1" },
  }),
}))
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {}
      const b: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          updates.push({ payload, filters })
          return b
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return b
        },
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      }
      return b
    },
  }),
}))

import { NextRequest } from "next/server"
import { GET, PATCH } from "./route"

function patchReq(body: unknown): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/me/preferencias", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  prefValue = true
  updates.length = 0
})

describe("GET /api/me/preferencias", () => {
  it("retorna a preferência do usuário logado", async () => {
    prefValue = false
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ notif_obra_aprovacao_email: false })
  })
})

describe("PATCH /api/me/preferencias", () => {
  it("grava a preferência na própria linha (id + org do usuário)", async () => {
    const res = await PATCH(patchReq({ notif_obra_aprovacao_email: false }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, notif_obra_aprovacao_email: false })
    expect(updates).toHaveLength(1)
    expect(updates[0]?.payload).toEqual({ notif_obra_aprovacao_email: false })
    expect(updates[0]?.filters).toMatchObject({ id: "sup-1", org_id: "org-1" })
  })

  it("rejeita valor não-booleano (400) sem gravar", async () => {
    for (const bad of [{ notif_obra_aprovacao_email: "sim" }, {}, { outra_coluna: true }]) {
      const res = await PATCH(patchReq(bad))
      expect(res.status).toBe(400)
    }
    expect(updates).toHaveLength(0)
  })
})
