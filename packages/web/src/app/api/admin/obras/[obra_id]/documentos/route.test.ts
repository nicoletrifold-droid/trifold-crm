/**
 * Upload de documento de obra — fluxo signed-upload (JSON) + legado (FormData).
 * O binário grande não passa mais pela função (teto ~4.5 MB da Vercel); o POST
 * JSON só registra metadados de um objeto que o browser já subiu ao Storage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "admin"
let vinculoExists = true
let objectExists = true
let pathAlreadyRegistered = false
const inserted: Record<string, Record<string, unknown>[]> = {}
const removed: string[][] = []
const uploaded: string[] = []

function makeSupabase() {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        insert: (payload: Record<string, unknown>) => {
          ;(inserted[table] ??= []).push(payload)
          return b
        },
        single: async () => {
          if (table === "obras") {
            return { data: { id: "obra-1", name: "Vind Residence" }, error: null }
          }
          if (table === "obra_documentos") {
            return {
              data: {
                id: "doc-1",
                name: "Contrato 404",
                category: "Contratos",
                filename: "contrato.pdf",
                file_size_bytes: 123,
                created_at: "2026-07-23",
                cliente_obra_id: null,
              },
              error: null,
            }
          }
          if (table === "obra_upload_aprovacoes") {
            return { data: { id: "apr-1", status: "pendente" }, error: null }
          }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === "cliente_obras") {
            return { data: vinculoExists ? { id: "vinc-404" } : null, error: null }
          }
          // Checagem anti-reuso de storage_path (obra_documentos / obra_upload_aprovacoes).
          if (pathAlreadyRegistered) {
            return { data: { id: "existente" }, error: null }
          }
          return { data: null, error: null }
        },
      }
      return b
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths)
          return { error: null }
        },
        upload: async (path: string) => {
          uploaded.push(path)
          return { error: null }
        },
        exists: async () => ({ data: objectExists, error: null }),
      }),
    },
  }
}

vi.mock("@web/lib/api-auth", async () => {
  // 75-308: gate = requireCapability; decisão vem do SEED do registro (varia por `role`).
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  const allowed = (r: string, capability: keyof typeof CAPABILITY_SEED) =>
    r === "admin" || (CAPABILITY_SEED[capability] as readonly string[]).includes(r)
  return {
    requireAuth: async () => ({
      supabase: makeSupabase(),
      appUser: { id: "user-1", name: "Samara", role, org_id: "org-1" },
    }),
    requireCapability: async (u: { role: string }, capability: keyof typeof CAPABILITY_SEED) =>
      allowed(u.role, capability)
        ? null
        : new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  }
})
vi.mock("@web/lib/permissions", async () => {
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  return {
    can: async (_u: string, _o: string, capability: keyof typeof CAPABILITY_SEED) =>
      role === "admin" || (CAPABILITY_SEED[capability] as readonly string[]).includes(role),
  }
})
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => makeSupabase(),
}))
vi.mock("@web/lib/audit", () => ({
  getRequestIp: () => "127.0.0.1",
  logAudit: async () => {},
}))
vi.mock("@web/lib/notificacoes", () => ({ notifyClientes: async () => {} }))
vi.mock("@web/lib/obras/aprovacao-notifications", () => ({
  notificarAdminsNovoUpload: async () => {},
}))

import { NextRequest } from "next/server"
import { POST } from "./route"

const params = { params: Promise.resolve({ obra_id: "obra-1" }) }

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/admin/obras/obra-1/documentos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const UUID = "1f2a3b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"
const validBody = {
  storage_path: `obra-docs/obra-1/${UUID}.pdf`,
  name: "Contrato 404",
  category: "Contratos",
  cliente_obra_id: "vinc-404",
  filename: "contrato assinado.pdf",
  file_size_bytes: 8 * 1024 * 1024, // 8 MB — acima do teto da Vercel, dentro dos 50 MB
}

beforeEach(() => {
  role = "admin"
  vinculoExists = true
  objectExists = true
  pathAlreadyRegistered = false
  for (const k of Object.keys(inserted)) delete inserted[k]
  removed.length = 0
  uploaded.length = 0
})

describe("POST /api/admin/obras/[obra_id]/documentos (JSON — signed upload)", () => {
  it("registra metadados sem re-upload do binário (arquivo já está no Storage)", async () => {
    const res = await POST(jsonReq(validBody), params)
    expect(res.status).toBe(201)
    expect(uploaded).toHaveLength(0)
    expect(inserted["obra_documentos"]?.[0]).toMatchObject({
      obra_id: "obra-1",
      storage_path: `obra-docs/obra-1/${UUID}.pdf`,
      file_size_bytes: 8 * 1024 * 1024,
      cliente_obra_id: "vinc-404",
      category: "Contratos",
    })
  })

  it("recusa storage_path de outra obra (400) sem registrar", async () => {
    const res = await POST(
      jsonReq({ ...validBody, storage_path: `obra-docs/obra-OUTRA/${UUID}.pdf` }),
      params
    )
    expect(res.status).toBe(400)
    expect(inserted["obra_documentos"]).toBeUndefined()
  })

  it("recusa path traversal e formato fora do padrão uuid (400)", async () => {
    for (const bad of [
      `obra-docs/obra-1/../obra-2/${UUID}.pdf`,
      `obra-docs/obra-1/${UUID}.pdf/../../evil`,
      "obra-docs/obra-1/qualquer.pdf",
    ]) {
      const res = await POST(jsonReq({ ...validBody, storage_path: bad }), params)
      expect(res.status).toBe(400)
    }
    expect(inserted["obra_documentos"]).toBeUndefined()
    expect(removed).toHaveLength(0)
  })

  it("recusa storage_path já registrado (409) sem apagar o objeto", async () => {
    pathAlreadyRegistered = true
    const res = await POST(jsonReq(validBody), params)
    expect(res.status).toBe(409)
    expect(removed).toHaveLength(0)
    expect(inserted["obra_documentos"]).toBeUndefined()
  })

  it("recusa registro de objeto que não existe no Storage (400)", async () => {
    objectExists = false
    const res = await POST(jsonReq(validBody), params)
    expect(res.status).toBe(400)
    expect(inserted["obra_documentos"]).toBeUndefined()
  })

  it("acima de 50 MB: 413 e remove o objeto órfão do Storage", async () => {
    const res = await POST(
      jsonReq({ ...validBody, file_size_bytes: 51 * 1024 * 1024 }),
      params
    )
    expect(res.status).toBe(413)
    expect(removed).toEqual([[`obra-docs/obra-1/${UUID}.pdf`]])
    expect(inserted["obra_documentos"]).toBeUndefined()
  })

  it("destinatário inválido: 400 e remove o objeto órfão", async () => {
    vinculoExists = false
    const res = await POST(jsonReq(validBody), params)
    expect(res.status).toBe(400)
    expect(removed).toEqual([[`obra-docs/obra-1/${UUID}.pdf`]])
    expect(inserted["obra_documentos"]).toBeUndefined()
  })

  it("role obras: vai para fila de aprovação com metadados completos", async () => {
    role = "obras"
    const res = await POST(jsonReq(validBody), params)
    expect(res.status).toBe(201)
    expect(inserted["obra_upload_aprovacoes"]?.[0]).toMatchObject({
      obra_id: "obra-1",
      tipo: "documento",
      storage_path: `obra-docs/obra-1/${UUID}.pdf`,
      metadata: {
        file_size_bytes: 8 * 1024 * 1024,
        cliente_obra_id: "vinc-404",
        category: "Contratos",
      },
    })
    expect(inserted["obra_documentos"]).toBeUndefined()
  })

  it("role corretor: 403", async () => {
    role = "corretor"
    const res = await POST(jsonReq(validBody), params)
    expect(res.status).toBe(403)
  })
})

describe("POST /api/admin/obras/[obra_id]/documentos (FormData — legado)", () => {
  it("segue aceitando o binário no corpo e sobe ao Storage", async () => {
    const fd = new FormData()
    fd.append("file", new File(["conteudo"], "art.pdf", { type: "application/pdf" }))
    fd.append("name", "ART Fundação")
    fd.append("category", "ART/RRT")
    const req = new NextRequest(
      "https://crm.trifold.eng.br/api/admin/obras/obra-1/documentos",
      { method: "POST", body: fd }
    )
    const res = await POST(req, params)
    expect(res.status).toBe(201)
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]).toMatch(/^obra-docs\/obra-1\//)
    expect(inserted["obra_documentos"]?.[0]).toMatchObject({
      name: "ART Fundação",
      category: "ART/RRT",
      cliente_obra_id: null,
    })
  })
})
