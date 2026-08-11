/**
 * Story 75-297 — POST /api/imob/leads/[id]/reativar (reativação de lead perdido do IMOB).
 *
 * Cobre a fronteira do mundo IMOB e o efeito da reativação:
 *  - sem acesso ao módulo IMOB → 403 (imobGuard);
 *  - lead do funil principal → 404 (nunca toca o mundo house);
 *  - lead que não está em etapa perdida → 422;
 *  - sucesso: volta para "Aguardando atendimento" (STAGE_IDS.novo), limpa
 *    lost_reason/lost_reason_grupo, troca o responsável e grava activity lead_reactivated.
 *
 * O fakeDb ignora os .eq() (filtros não são simulados) — os testes validam PAYLOADS,
 * não filtros.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { STAGE_IDS } from "@trifold/shared"
import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"

vi.mock("server-only", () => ({}))

let imobAccess = true

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    appUser: { id: "u-gestora", name: "Daiana", role: "imob", org_id: "org-1" },
  }),
}))

vi.mock("@web/lib/permissions", () => ({
  canAccess: async () => imobAccess,
}))

const logAudit = vi.fn(async () => {})
vi.mock("@web/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAudit(...(args as [])),
  getRequestIp: () => "127.0.0.1",
}))

type Row = Record<string, unknown>
let leadRow: Row | null = null
let userRow: Row | null = null
let leadUpdate: Row | null = null
let activityInsert: Row | null = null

function selectMaybe(rowFn: () => Row | null) {
  const b: Record<string, unknown> = {
    eq: () => b,
    maybeSingle: async () => ({ data: rowFn(), error: null }),
  }
  return b
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "leads") {
        return {
          select: () => selectMaybe(() => leadRow),
          update: (payload: Row) => {
            leadUpdate = payload
            const b: Record<string, unknown> = {
              eq: () => b,
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            }
            return b
          },
        }
      }
      if (table === "users") {
        return { select: () => selectMaybe(() => userRow) }
      }
      if (table === "activities") {
        return {
          insert: async (row: Row) => {
            activityInsert = row
            return { error: null }
          },
        }
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
  }),
}))

import { POST } from "./route"
import type { NextRequest } from "next/server"

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://test/api/imob/leads/lead-1/reativar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const params = { params: Promise.resolve({ id: "lead-1" }) }

const PERDIDO_LEAD: Row = {
  id: "lead-1",
  segmento: "imob",
  name: "Talita",
  stage_id: PERDIDO_STAGE_IDS[1], // Não Qualificado
  assigned_broker_id: "u-antiga",
  lost_reason: "sem retorno",
  lost_reason_grupo: "sem_contato",
}

beforeEach(() => {
  imobAccess = true
  leadRow = { ...PERDIDO_LEAD }
  userRow = { id: "u-nova", name: "Daiana", role: "imob", is_active: true }
  leadUpdate = null
  activityInsert = null
  logAudit.mockClear()
})

describe("POST /api/imob/leads/[id]/reativar (Story 75-297)", () => {
  it("sem acesso ao módulo IMOB → 403", async () => {
    imobAccess = false
    const res = await POST(makeRequest({ broker_id: "u-nova", motivo: "voltou" }), params)
    expect(res.status).toBe(403)
    expect(leadUpdate).toBeNull()
  })

  it("sem motivo → 400 e nada muda", async () => {
    const res = await POST(makeRequest({ broker_id: "u-nova" }), params)
    expect(res.status).toBe(400)
    expect(leadUpdate).toBeNull()
  })

  it("sem responsável → 400 e nada muda", async () => {
    const res = await POST(makeRequest({ motivo: "voltou" }), params)
    expect(res.status).toBe(400)
    expect(leadUpdate).toBeNull()
  })

  it("lead do funil principal → 404 (fronteira IMOB)", async () => {
    leadRow = { ...PERDIDO_LEAD, segmento: "principal" }
    const res = await POST(makeRequest({ broker_id: "u-nova", motivo: "voltou" }), params)
    expect(res.status).toBe(404)
    expect(leadUpdate).toBeNull()
  })

  it("lead que não está perdido → 422", async () => {
    leadRow = { ...PERDIDO_LEAD, stage_id: STAGE_IDS.visitou }
    const res = await POST(makeRequest({ broker_id: "u-nova", motivo: "voltou" }), params)
    expect(res.status).toBe(422)
    expect(leadUpdate).toBeNull()
  })

  it("responsável inativo/cliente → 400", async () => {
    userRow = { id: "u-nova", name: "Ex", role: "imob", is_active: false }
    const res = await POST(makeRequest({ broker_id: "u-nova", motivo: "voltou" }), params)
    expect(res.status).toBe(400)
    expect(leadUpdate).toBeNull()
  })

  it("sucesso: volta p/ Aguardando, limpa perda, troca responsável e registra rastro", async () => {
    const res = await POST(makeRequest({ broker_id: "u-nova", motivo: "cliente retornou" }), params)
    expect(res.status).toBe(200)

    expect(leadUpdate).toMatchObject({
      stage_id: STAGE_IDS.novo,
      assigned_broker_id: "u-nova",
      lost_reason: null,
      lost_reason_grupo: null,
    })

    expect(activityInsert).toMatchObject({
      lead_id: "lead-1",
      type: "lead_reactivated",
      metadata: {
        motivo: "cliente retornou",
        imob: true,
        to_broker_id: "u-nova",
        from_broker_id: "u-antiga",
        previous_lost_reason: "sem retorno",
        previous_lost_reason_grupo: "sem_contato",
      },
    })

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lead.reactivate", entity_id: "lead-1" })
    )
  })
})
