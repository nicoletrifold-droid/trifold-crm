/**
 * Story 75-280 — POST /api/properties (cadastro de empreendimento).
 *
 * Cobre os defeitos que faziam a tela nunca gravar:
 *  - `zip_code` no INSERT (coluna que não existe em properties → Postgres recusa tudo);
 *  - `address` NOT NULL recebendo null;
 *  - 8 campos coletados pela tela e descartados pelo INSERT;
 *  - `status` fora do enum property_status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let role = "admin"

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: fakeSupabase,
    appUser: { id: "u-1", name: "User", role, org_id: "org-1" },
  }),
  requireRole: (user: { role: string }, allowed: string[]) =>
    allowed.includes(user.role)
      ? null
      : new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
}))

/** Último payload passado a .insert(), para inspeção nos testes. */
let insertedPayload: Record<string, unknown> | null = null
let insertTable: string | null = null

const fakeSupabase = {
  from(table: string) {
    insertTable = table
    return {
      insert(payload: Record<string, unknown>) {
        insertedPayload = payload
        return {
          select: () => ({
            single: async () => ({
              data: { id: "p-1", ...payload },
              error: null,
            }),
          }),
        }
      },
    }
  },
}

import { POST } from "./route"

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/properties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validBody = {
  name: "Residencial Vind",
  slug: "residencial-vind",
  status: "planning",
  address: "Rua das Acácias, 120",
  neighborhood: "Centro",
  city: "Londrina",
  state: "pr",
  concept: "Conceito X",
  description: "Descrição Y",
  delivery_date: "2027-12-01",
  total_units: 48,
  total_floors: 14,
  units_per_floor: 4,
  create_obra: false,
}

beforeEach(() => {
  role = "admin"
  insertedPayload = null
  insertTable = null
})

describe("POST /api/properties (Story 75-280)", () => {
  it("não envia zip_code no INSERT (coluna inexistente em properties)", async () => {
    const res = await POST(req(validBody))
    expect(res.status).toBe(201)
    expect(insertTable).toBe("properties")
    expect(insertedPayload).not.toBeNull()
    expect(insertedPayload).not.toHaveProperty("zip_code")
  })

  it("ignora zip_code mesmo se o body mandar (não deixa vazar para o INSERT)", async () => {
    const res = await POST(req({ ...validBody, zip_code: "86010-000" }))
    expect(res.status).toBe(201)
    expect(insertedPayload).not.toHaveProperty("zip_code")
  })

  it("persiste os 8 campos que a tela coleta e o INSERT descartava", async () => {
    await POST(req(validBody))
    expect(insertedPayload).toMatchObject({
      status: "planning",
      neighborhood: "Centro",
      concept: "Conceito X",
      description: "Descrição Y",
      delivery_date: "2027-12-01",
      total_units: 48,
      total_floors: 14,
      units_per_floor: 4,
    })
  })

  it("normaliza UF para maiúsculas e grava address sem null", async () => {
    await POST(req(validBody))
    expect(insertedPayload).toMatchObject({
      state: "PR",
      address: "Rua das Acácias, 120",
      org_id: "org-1",
      is_active: true,
    })
  })

  it("address ausente → 400 com mensagem clara (coluna é NOT NULL)", async () => {
    const noAddress: Record<string, unknown> = { ...validBody }
    delete noAddress.address
    const res = await POST(req(noAddress))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("address is required")
    expect(insertedPayload).toBeNull()
  })

  it("address só com espaços → 400", async () => {
    const res = await POST(req({ ...validBody, address: "   " }))
    expect(res.status).toBe(400)
    expect(insertedPayload).toBeNull()
  })

  it("status fora do enum property_status → 400", async () => {
    const res = await POST(req({ ...validBody, status: "em_obras" }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("status must be one of")
    expect(insertedPayload).toBeNull()
  })

  it("sem status no body → não força valor (deixa o default do banco)", async () => {
    const noStatus: Record<string, unknown> = { ...validBody }
    delete noStatus.status
    const res = await POST(req(noStatus))
    expect(res.status).toBe(201)
    expect(insertedPayload?.status).toBeUndefined()
  })

  it("corretor não pode criar empreendimento → 403", async () => {
    role = "corretor"
    const res = await POST(req(validBody))
    expect(res.status).toBe(403)
    expect(insertedPayload).toBeNull()
  })
})
