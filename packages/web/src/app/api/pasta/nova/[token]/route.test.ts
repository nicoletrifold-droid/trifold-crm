/**
 * Story 75-146 — Testes do POST público de auto-cadastro de pasta.
 *
 * Cobre: link válido cria pasta com origem='auto_cadastro'/link_id/created_by=null e
 * imobiliária DO LINK (ignora a do body); token inexistente/revogado → 404; e a falha
 * gracioso da notificação (WhatsApp/template PENDING) NÃO derruba a criação (AC 3, 4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const notifyMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@web/lib/notificacoes", () => ({
  notifyNovaPastaGestor: (...a: unknown[]) => notifyMock(...a),
}))

// Estado configurável do banco mockado.
let linkRow: Record<string, unknown> | null
let insertedPasta: Record<string, unknown> | null
let docsError: { message: string } | null
let deletedPastaId: string | null

beforeEach(() => {
  linkRow = { id: "link-1", org_id: "org-1", imobiliaria: "Imobiliária X", imobiliaria_id: "imob-1", ativo: true }
  insertedPasta = null
  docsError = null
  deletedPastaId = null
  notifyMock.mockClear()
  notifyMock.mockResolvedValue(undefined)
})

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "pasta_links") {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: linkRow, error: null }),
        }
        return b
      }
      if (table === "pastas") {
        const b: Record<string, unknown> = {
          insert: (payload: Record<string, unknown>) => { insertedPasta = payload; return b },
          select: () => b,
          single: async () => ({ data: { id: "pasta-1", token: "pastatoken" }, error: null }),
          delete: () => b,
          eq: (_c: string, v: string) => { deletedPastaId = v; return Promise.resolve({ data: null, error: null }) },
        }
        return b
      }
      // pasta_documentos: insert(...).select(...) é awaited direto.
      const b: Record<string, unknown> = {
        insert: () => b,
        select: () => Promise.resolve({ data: docsError ? null : [{ id: "d1", slug: "cpf", label: "CPF", titular: "interessado", situacao: "pendente" }], error: docsError }),
      }
      return b
    },
  }),
}))

import { NextRequest } from "next/server"
import { POST } from "./route"

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/pasta/nova/tok", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

describe("POST /api/pasta/nova/[token]", () => {
  it("cria pasta com origem=auto_cadastro, link_id, created_by=null e imobiliária DO LINK", async () => {
    const res = await POST(makeReq({ nome: "Fulano", tipo: "pf", imobiliaria: "OUTRA IMOB (deve ser ignorada)" }), ctx("tok"))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.token).toBe("pastatoken")
    expect(insertedPasta).toMatchObject({
      origem: "auto_cadastro",
      link_id: "link-1",
      created_by: null,
      org_id: "org-1",
      imobiliaria: "Imobiliária X",
      imobiliaria_id: "imob-1",
      nome: "Fulano",
    })
  })

  it("ignora a imobiliária do body (usa sempre a do link)", async () => {
    await POST(makeReq({ nome: "Beltrano", imobiliaria: "Fraude Imob" }), ctx("tok"))
    expect(insertedPasta?.imobiliaria).toBe("Imobiliária X")
  })

  it("rejeita token inexistente com 404", async () => {
    linkRow = null
    const res = await POST(makeReq({ nome: "Fulano" }), ctx("tok"))
    expect(res.status).toBe(404)
    expect(insertedPasta).toBeNull()
  })

  it("rejeita link revogado (ativo=false) com 404", async () => {
    linkRow = { id: "link-1", org_id: "org-1", imobiliaria: "Imobiliária X", imobiliaria_id: "imob-1", ativo: false }
    const res = await POST(makeReq({ nome: "Fulano" }), ctx("tok"))
    expect(res.status).toBe(404)
    expect(insertedPasta).toBeNull()
  })

  it("exige nome (400)", async () => {
    const res = await POST(makeReq({ nome: "   " }), ctx("tok"))
    expect(res.status).toBe(400)
  })

  it("faz rollback da pasta se o seed de documentos falhar", async () => {
    docsError = { message: "boom" }
    const res = await POST(makeReq({ nome: "Fulano" }), ctx("tok"))
    expect(res.status).toBe(500)
    expect(deletedPastaId).toBe("pasta-1")
  })

  it("GRACEFUL FALLBACK: a pasta é criada mesmo se a notificação (WhatsApp/template PENDING) falhar", async () => {
    notifyMock.mockRejectedValueOnce(new Error("Graph API 132000 template PENDING"))
    const res = await POST(makeReq({ nome: "Fulano" }), ctx("tok"))
    // A criação persiste e retorna 201 — a notificação é fire-and-forget (.catch).
    expect(res.status).toBe(201)
    expect(insertedPasta?.origem).toBe("auto_cadastro")
    expect(notifyMock).toHaveBeenCalledOnce()
  })
})
