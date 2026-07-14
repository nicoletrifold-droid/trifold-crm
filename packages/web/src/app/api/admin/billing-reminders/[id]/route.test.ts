/**
 * Story 78-14 (REL-001) — Testes do PATCH de billing-reminders na transição status→'paid'.
 *
 * Foco: a migration 172 tornou due_date nullable (assinaturas fixas recém-seedadas nascem sem
 * vencimento). Marcar 'paid' numa linha recorrente (monthly/annual) com due_date=null NÃO pode
 * chamar avancarCiclo(null) (→ TypeError → HTTP 500): deve apenas registrar paid_at, sem avançar
 * ciclo nem inventar data. Também cobre a regressão: com due_date preenchido, a recorrência avança
 * normalmente (due_date novo, status='pending', last_alerted_on=null).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Payload capturado do UPDATE (segunda cadeia de query da rota).
let capturedUpdate: Record<string, unknown> | null = null
// Linha "atual" retornada pela primeira cadeia (select due_date, billing_cycle).
let atualRow: Record<string, unknown> | null = null

function makeSupabase() {
  return {
    from: () => {
      const builder: Record<string, unknown> = {
        _isUpdate: false,
        select: () => builder,
        eq: () => builder,
        update: (payload: Record<string, unknown>) => {
          ;(builder as { _isUpdate: boolean })._isUpdate = true
          capturedUpdate = payload
          return builder
        },
        maybeSingle: async () => {
          if ((builder as { _isUpdate: boolean })._isUpdate) {
            // Ecoa a linha final que a rota devolve no corpo da resposta.
            return { data: { id: "r1", ...capturedUpdate }, error: null }
          }
          return { data: atualRow, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    supabase: makeSupabase(),
    appUser: { id: "u1", role: "admin" },
    user: { id: "u1" },
  }),
  requireRole: () => null,
}))

import { NextRequest } from "next/server"
import { PATCH } from "./route"

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/admin/billing-reminders/r1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeCtx() {
  return { params: Promise.resolve({ id: "r1" }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedUpdate = null
  atualRow = null
})

describe("PATCH billing-reminders/[id] — recorrência-ao-pagar (REL-001)", () => {
  it("assinatura fixa recorrente com due_date=null → 200, seta paid_at, NÃO avança ciclo", async () => {
    // Assinatura fixa recém-seedada (migration 172): billing_cycle recorrente porém sem vencimento.
    atualRow = { due_date: null, billing_cycle: "monthly" }

    const res = await PATCH(makeReq({ status: "paid" }), makeCtx())

    expect(res.status).toBe(200) // não estoura (antes: avancarCiclo(null) → 500)
    expect(capturedUpdate).not.toBeNull()
    // paid_at é registrado (histórico do pagamento).
    expect(typeof capturedUpdate!.paid_at).toBe("string")
    // NÃO avançou ciclo: nenhum due_date novo, status permanece 'paid', dedup intacto.
    expect(capturedUpdate!.due_date).toBeUndefined()
    expect(capturedUpdate!.status).toBe("paid")
    expect(capturedUpdate!.last_alerted_on).toBeUndefined()
  })

  it("recorrência normal com due_date preenchido → avança ciclo (regressão preservada)", async () => {
    atualRow = { due_date: "2026-07-10", billing_cycle: "monthly" }

    const res = await PATCH(makeReq({ status: "paid" }), makeCtx())

    expect(res.status).toBe(200)
    expect(capturedUpdate).not.toBeNull()
    // Nasce pronta pro próximo ciclo: due_date avançado, status='pending', dedup resetado.
    expect(typeof capturedUpdate!.due_date).toBe("string")
    expect(capturedUpdate!.due_date).not.toBe("2026-07-10")
    expect(capturedUpdate!.status).toBe("pending")
    expect(capturedUpdate!.last_alerted_on).toBeNull()
    expect(typeof capturedUpdate!.paid_at).toBe("string")
  })
})
