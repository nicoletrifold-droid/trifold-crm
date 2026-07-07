/**
 * Story 75-146 — Não-regressão do fluxo INTERNO de criação de pasta.
 * O POST /api/pastas deve seguir idêntico: created_by = usuário logado e SEM
 * origem='auto_cadastro'/link_id (a origem 'interno' vem do default do banco).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "admin"
let insertedPasta: Record<string, unknown> | null = null

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: {
      from: (table: string) => {
        if (table === "pastas") {
          const b: Record<string, unknown> = {
            insert: (payload: Record<string, unknown>) => { insertedPasta = payload; return b },
            select: () => b,
            single: async () => ({ data: { id: "pasta-1", token: "tok" }, error: null }),
          }
          return b
        }
        // pasta_documentos.insert(...).select(...) awaited direto.
        const b: Record<string, unknown> = {
          insert: () => b,
          select: () => Promise.resolve({ data: [{ id: "d1", slug: "cpf", label: "CPF", titular: "interessado", situacao: "pendente" }], error: null }),
        }
        return b
      },
    },
    appUser: { id: "user-1", name: "Gestor", role, org_id: "org-1" },
  }),
}))

import { NextRequest } from "next/server"
import { POST } from "./route"

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/pastas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  role = "admin"
  insertedPasta = null
})

describe("POST /api/pastas (fluxo interno)", () => {
  it("mantém created_by = usuário e NÃO marca auto_cadastro", async () => {
    const res = await POST(makeReq({ nome: "Fulano", tipo: "pf", imobiliaria: "Imob X" }))
    expect(res.status).toBe(201)
    expect(insertedPasta).toMatchObject({ created_by: "user-1", org_id: "org-1", imobiliaria: "Imob X" })
    expect(insertedPasta?.origem).toBeUndefined()
    expect(insertedPasta?.link_id).toBeUndefined()
  })

  it("bloqueia perfil não-gestor com 403", async () => {
    role = "corretor"
    const res = await POST(makeReq({ nome: "Fulano" }))
    expect(res.status).toBe(403)
    expect(insertedPasta).toBeNull()
  })
})
