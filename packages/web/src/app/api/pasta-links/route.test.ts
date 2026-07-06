/**
 * Story 75-146 — Testes de POST /api/pasta-links (gerar link de auto-cadastro).
 * Cobre: gate isPastaManager (403 p/ corretor), criação p/ gestor, imobiliária obrigatória.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "admin"
let insertedLink: Record<string, unknown> | null = null

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: {
      from: () => {
        const b: Record<string, unknown> = {
          insert: (payload: Record<string, unknown>) => { insertedLink = payload; return b },
          select: () => b,
          single: async () => ({
            data: { id: "link-1", imobiliaria: insertedLink?.imobiliaria, token: "abc", ativo: true, corretor_nome: null, created_at: "2026-07-06T00:00:00Z" },
            error: null,
          }),
        }
        return b
      },
    },
    appUser: { id: "u-1", name: "Gestor", role, org_id: "org-1" },
  }),
}))

import { NextRequest } from "next/server"
import { POST } from "./route"

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/pasta-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  role = "admin"
  insertedLink = null
})

describe("POST /api/pasta-links", () => {
  it("gestor cria link com token e ativo=true", async () => {
    const res = await POST(makeReq({ imobiliaria: "Imob X" }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.imobiliaria).toBe("Imob X")
    expect(json.data.ativo).toBe(true)
    expect(insertedLink).toMatchObject({ imobiliaria: "Imob X", ativo: true, org_id: "org-1", created_by: "u-1" })
    expect(typeof insertedLink?.token).toBe("string")
  })

  it("bloqueia perfil não-gestor (corretor) com 403", async () => {
    role = "corretor"
    const res = await POST(makeReq({ imobiliaria: "Imob X" }))
    expect(res.status).toBe(403)
    expect(insertedLink).toBeNull()
  })

  it("exige imobiliária (400)", async () => {
    const res = await POST(makeReq({ imobiliaria: "" }))
    expect(res.status).toBe(400)
  })
})
