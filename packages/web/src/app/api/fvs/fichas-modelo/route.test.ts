/**
 * Story 75-293 — POST /api/fvs/fichas-modelo.
 * Cobre a regra "1 ficha ativa por serviço" (a nova desativa a anterior, nunca
 * apaga), o cleanup quando os itens falham, e o guard (401/403/404).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let appUser: { id: string; org_id: string; role: string } | null = null
vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () =>
    appUser
      ? { appUser }
      : { error: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) },
}))

let moduleAllowed = true
vi.mock("@web/lib/permissions", () => ({
  canAccess: async () => moduleAllowed,
}))

let servicoRow: Record<string, unknown> | null = { id: "srv-1" }
let itensInsertFails = false
/** Operações executadas, na ordem — para provar desativa-antes-de-inserir e o cleanup. */
let ops: string[] = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === "fvs_servicos" ? servicoRow : null, error: null }),
        update: (patch: Record<string, unknown>) => {
          ops.push(`update:${table}:ativa=${String(patch.ativa)}`)
          const u: Record<string, unknown> = { eq: () => u, then: (r: (v: unknown) => unknown) => r({ error: null }) }
          return u
        },
        insert: (rows: unknown) => {
          ops.push(`insert:${table}`)
          if (table === "fvs_fichas_modelo") {
            return {
              select: () => ({
                single: async () => ({ data: { id: "ficha-nova", ...(rows as object) }, error: null }),
              }),
            }
          }
          return {
            select: async () =>
              itensInsertFails ? { data: null, error: { message: "boom" } } : { data: rows, error: null },
          }
        },
        delete: () => {
          ops.push(`delete:${table}`)
          const d: Record<string, unknown> = { eq: () => d, then: (r: (v: unknown) => unknown) => r({ error: null }) }
          return d
        },
      }
      return b
    },
  }),
}))

import { POST } from "./route"

const BODY = {
  servico_id: "srv-1",
  titulo: "FVS Revestimento Cerâmico",
  foto_config: "por_ficha",
  itens: [
    { descricao: "Prumo", tipo: "medida", unidade: "mm", tolerancia: "±3 mm em 2 m" },
    { descricao: "Peças ocas (percussão)", tipo: "botao" },
  ],
}

function call(body: unknown = BODY) {
  return POST(new Request("https://x", { method: "POST", body: JSON.stringify(body) }) as never)
}

beforeEach(() => {
  appUser = { id: "u-1", org_id: "org-1", role: "supervisor" }
  moduleAllowed = true
  servicoRow = { id: "srv-1" }
  itensInsertFails = false
  ops = []
})

describe("POST /api/fvs/fichas-modelo", () => {
  it("anônimo → 401 · sem módulo → 403", async () => {
    appUser = null
    expect((await call()).status).toBe(401)
    appUser = { id: "u-1", org_id: "org-1", role: "broker" }
    moduleAllowed = false
    expect((await call()).status).toBe(403)
  })

  it("serviço de outra org → 404", async () => {
    servicoRow = null
    expect((await call()).status).toBe(404)
  })

  it("sem itens → 400", async () => {
    expect((await call({ ...BODY, itens: [] })).status).toBe(400)
  })

  it("desativa a ficha ativa anterior ANTES de inserir a nova (nunca apaga)", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(ops).toEqual([
      "update:fvs_fichas_modelo:ativa=false",
      "insert:fvs_fichas_modelo",
      "insert:fvs_ficha_modelo_itens",
    ])
    expect(ops).not.toContain("delete:fvs_fichas_modelo")
  })

  it("itens falhando → 500 e a ficha recém-criada é removida (cleanup)", async () => {
    itensInsertFails = true
    const res = await call()
    expect(res.status).toBe(500)
    expect(ops).toContain("delete:fvs_fichas_modelo")
  })
})
