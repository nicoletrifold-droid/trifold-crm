/**
 * Story 75-293 — POST /api/fvs/locais (lote).
 * Cobre o guard do módulo (401 anônimo, 403 sem acesso ao módulo "fvs"),
 * payload inválido 400, obra de outra org 404, lote OK 200 e conflito 409.
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

let obraRow: Record<string, unknown> | null = { id: "obra-1" }
let insertError: { code?: string; message: string } | null = null
/** Linhas passadas ao .upsert() — para checar org_id/tipo aplicados ao lote. */
let inserted: Record<string, unknown>[] = []
let upsertOpts: Record<string, unknown> | null = null

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === "obras" ? obraRow : null, error: null }),
        upsert: (rows: Record<string, unknown>[], opts: Record<string, unknown>) => {
          inserted = rows
          upsertOpts = opts
          return {
            select: async () => (insertError ? { data: null, error: insertError } : { data: rows, error: null }),
          }
        },
      }
      return b
    },
  }),
}))

import { POST } from "./route"

function call(body: unknown) {
  return POST(
    new Request("https://x", { method: "POST", body: JSON.stringify(body) }) as never
  )
}

const LOTE = {
  obra_id: "obra-1",
  tipo: "apartamento",
  torre: "Única",
  locais: [
    { nome: "Apto 101", pavimento: 1 },
    { nome: "Apto 102", pavimento: 1 },
  ],
}

beforeEach(() => {
  appUser = { id: "u-1", org_id: "org-1", role: "obras" }
  moduleAllowed = true
  obraRow = { id: "obra-1" }
  insertError = null
  inserted = []
  upsertOpts = null
})

describe("POST /api/fvs/locais", () => {
  it("anônimo → 401", async () => {
    appUser = null
    expect((await call(LOTE)).status).toBe(401)
  })

  it("sem acesso ao módulo fvs (ex.: corretor) → 403", async () => {
    moduleAllowed = false
    expect((await call(LOTE)).status).toBe(403)
  })

  it("sem obra_id ou sem locais → 400", async () => {
    expect((await call({ locais: LOTE.locais })).status).toBe(400)
    expect((await call({ obra_id: "obra-1", locais: [] })).status).toBe(400)
  })

  it("tipo de local inválido → 400", async () => {
    expect((await call({ ...LOTE, tipo: "quarto" })).status).toBe(400)
  })

  it("local do lote sem nome → 400 e nada é inserido", async () => {
    const res = await call({ ...LOTE, locais: [{ nome: "" }] })
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
  })

  it("obra de outra org (ou inexistente) → 404", async () => {
    obraRow = null
    expect((await call(LOTE)).status).toBe(404)
  })

  it("lote OK → 200 com org_id/tipo/torre aplicados a TODAS as linhas", async () => {
    const res = await call(LOTE)
    expect(res.status).toBe(200)
    expect(inserted).toHaveLength(2)
    for (const row of inserted) {
      expect(row).toMatchObject({ org_id: "org-1", obra_id: "obra-1", tipo: "apartamento", torre: "Única" })
    }
    const json = (await res.json()) as { locais: unknown[] }
    expect(json.locais).toHaveLength(2)
  })

  it("re-colar a planilha é inofensivo: upsert ignora duplicados em vez de derrubar o lote", async () => {
    const res = await call(LOTE)
    expect(res.status).toBe(200)
    expect(upsertOpts).toMatchObject({ onConflict: "obra_id,nome", ignoreDuplicates: true })
  })

  it("conflito residual (23505) → 409, não 500", async () => {
    insertError = { code: "23505", message: "duplicate key" }
    expect((await call(LOTE)).status).toBe(409)
  })
})
