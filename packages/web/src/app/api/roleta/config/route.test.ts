/**
 * Story 75-78 — Testes do PATCH /api/roleta/config para os tempos de SLA.
 * Cobre: permissão (broker → 403), validação corretor<gestor e inteiro>0,
 * e o caminho feliz (salva os campos de SLA).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// requireAuth mockável por teste.
let authUser: { org_id: string; role: string } | null = { org_id: "org-1", role: "admin" }
vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () =>
    authUser ? { appUser: authUser } : { error: new Response("unauth", { status: 401 }) },
}))

// Config atual no banco (para o cross-check quando só um campo é enviado).
let currentConfig: { sla_alerta_corretor_min: number; sla_alerta_gestor_min: number } = {
  sla_alerta_corretor_min: 30,
  sla_alerta_gestor_min: 60,
}
let lastUpsert: Record<string, unknown> | null = null

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: currentConfig, error: null }),
      upsert: (payload: Record<string, unknown>) => {
        lastUpsert = payload
        return builder
      },
      single: async () => ({ data: { ...lastUpsert }, error: null }),
    }
    return { from: () => builder }
  },
}))

import { PATCH } from "./route"

function makeReq(body: unknown) {
  return new Request("https://x/api/roleta/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  authUser = { org_id: "org-1", role: "admin" }
  currentConfig = { sla_alerta_corretor_min: 30, sla_alerta_gestor_min: 60 }
  lastUpsert = null
})

describe("PATCH /api/roleta/config — SLA (Story 75-78)", () => {
  it("AC4: broker → 403", async () => {
    authUser = { org_id: "org-1", role: "broker" }
    const res = await PATCH(makeReq({ sla_alerta_corretor_min: 10 }))
    expect(res.status).toBe(403)
  })

  it("AC1: salva tempos válidos (corretor < gestor)", async () => {
    const res = await PATCH(makeReq({ sla_alerta_corretor_min: 10, sla_alerta_gestor_min: 60, sla_alertas_enabled: true }))
    expect(res.status).toBe(200)
    expect(lastUpsert).toMatchObject({
      sla_alerta_corretor_min: 10,
      sla_alerta_gestor_min: 60,
      sla_alertas_enabled: true,
    })
  })

  it("AC3: corretor >= gestor → 400, não persiste", async () => {
    const res = await PATCH(makeReq({ sla_alerta_corretor_min: 70, sla_alerta_gestor_min: 60 }))
    expect(res.status).toBe(400)
    expect(lastUpsert).toBeNull()
  })

  it("AC3: valor não-inteiro/≤0 → 400", async () => {
    const res = await PATCH(makeReq({ sla_alerta_corretor_min: 0, sla_alerta_gestor_min: 60 }))
    expect(res.status).toBe(400)
  })

  it("AC3: cross-check com config atual quando só um campo vem (corretor 90 vs gestor atual 60 → 400)", async () => {
    const res = await PATCH(makeReq({ sla_alerta_corretor_min: 90 }))
    expect(res.status).toBe(400)
    expect(lastUpsert).toBeNull()
  })

  it("campo não-SLA segue funcionando (max_leads_per_day)", async () => {
    const res = await PATCH(makeReq({ max_leads_per_day: 80 }))
    expect(res.status).toBe(200)
    expect(lastUpsert).toMatchObject({ max_leads_per_day: 80 })
  })
})
