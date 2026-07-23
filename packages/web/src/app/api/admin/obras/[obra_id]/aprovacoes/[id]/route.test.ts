/**
 * DELETE de item da fila de aprovação — autor desfaz o próprio envio pendente
 * (ou dispensa um rejeitado); admin/supervisor também podem. A RLS não dá
 * DELETE ao autor: a fronteira de segurança é a rota (valida autor+status).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "gerente-relacionamento"
let userId = "samara-1"
let aprovacaoRow: Record<string, unknown> | null = null
let deleteMatches = true
const deletedIds: string[] = []
const removedPaths: string[][] = []

function makeUserClient() {
  return {
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: aprovacaoRow, error: null }),
      }
      return b
    },
  }
}

function makeAdminClient() {
  return {
    from: () => {
      const b: Record<string, unknown> = {
        delete: () => b,
        eq: () => b,
        in: () => b,
        select: () => b,
        maybeSingle: async () => {
          if (!deleteMatches) return { data: null, error: null }
          deletedIds.push(String((aprovacaoRow as { id?: string })?.id))
          return { data: { id: (aprovacaoRow as { id?: string })?.id }, error: null }
        },
      }
      return b
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removedPaths.push(paths)
          return { error: null }
        },
      }),
    },
  }
}

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: makeUserClient(),
    appUser: { id: userId, name: "Samara", role, org_id: "org-1" },
  }),
}))
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdminClient(),
}))
vi.mock("@web/lib/audit", () => ({ logAudit: async () => {}, getRequestIp: () => "" }))
vi.mock("@web/lib/email", () => ({ sendEmail: async () => {} }))
vi.mock("@web/lib/notificacoes", () => ({ notifyClientes: async () => {} }))

import { NextRequest } from "next/server"
import { DELETE } from "./route"

const params = { params: Promise.resolve({ obra_id: "obra-1", id: "apr-1" }) }

function req(): NextRequest {
  return new NextRequest(
    "https://crm.trifold.eng.br/api/admin/obras/obra-1/aprovacoes/apr-1",
    { method: "DELETE" }
  )
}

beforeEach(() => {
  role = "gerente-relacionamento"
  userId = "samara-1"
  deleteMatches = true
  deletedIds.length = 0
  removedPaths.length = 0
  aprovacaoRow = {
    id: "apr-1",
    tipo: "documento",
    storage_path: "obra-docs/obra-1/abc.pdf",
    storage_bucket: "obra-docs",
    enviado_por: "samara-1",
    status: "pendente",
  }
})

describe("DELETE /api/admin/obras/[obra_id]/aprovacoes/[id]", () => {
  it("autor exclui o próprio envio pendente e o arquivo do Storage", async () => {
    const res = await DELETE(req(), params)
    expect(res.status).toBe(200)
    expect(deletedIds).toEqual(["apr-1"])
    expect(removedPaths).toEqual([["obra-docs/obra-1/abc.pdf"]])
  })

  it("autor dispensa item rejeitado (arquivo também é removido)", async () => {
    aprovacaoRow = { ...aprovacaoRow!, status: "rejeitado" }
    const res = await DELETE(req(), params)
    expect(res.status).toBe(200)
    expect(removedPaths).toHaveLength(1)
  })

  it("quem não é autor nem gestor: 403 sem tocar em nada", async () => {
    userId = "outro-user"
    const res = await DELETE(req(), params)
    expect(res.status).toBe(403)
    expect(deletedIds).toHaveLength(0)
    expect(removedPaths).toHaveLength(0)
  })

  it("admin pode excluir envio de outro autor", async () => {
    role = "admin"
    userId = "admin-1"
    const res = await DELETE(req(), params)
    expect(res.status).toBe(200)
    expect(deletedIds).toEqual(["apr-1"])
  })

  it("status aprovado: 409 sem excluir", async () => {
    aprovacaoRow = { ...aprovacaoRow!, status: "aprovado" }
    const res = await DELETE(req(), params)
    expect(res.status).toBe(409)
    expect(deletedIds).toHaveLength(0)
  })

  it("aprovação concorrente (delete não casa nada): 409 e Storage intocado", async () => {
    deleteMatches = false
    const res = await DELETE(req(), params)
    expect(res.status).toBe(409)
    expect(removedPaths).toHaveLength(0)
  })

  it("cancelar pedido de exclusao_foto NÃO apaga a foto viva do Storage", async () => {
    aprovacaoRow = {
      ...aprovacaoRow!,
      tipo: "exclusao_foto",
      storage_bucket: "obra-fotos",
      storage_path: "obra-1/foto-viva.jpg",
    }
    const res = await DELETE(req(), params)
    expect(res.status).toBe(200)
    expect(deletedIds).toEqual(["apr-1"])
    expect(removedPaths).toHaveLength(0)
  })

  it("registro inexistente: 404", async () => {
    aprovacaoRow = null
    const res = await DELETE(req(), params)
    expect(res.status).toBe(404)
  })
})
