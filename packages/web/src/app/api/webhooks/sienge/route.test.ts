/**
 * Story 75-76 — Testes do webhook do Sienge (notificação de novo boleto).
 *
 * Cobre: token inválido (401), evento/status ignorados (200 sem disparo),
 * disparo no PAYMENT_SLIP_REGISTERED/CONFIRMED e idempotência (retry duplicado).
 *
 * `after()` é mockado para rodar a callback de forma síncrona; o promise é
 * capturado para o teste aguardar o processamento assíncrono.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// after() executa já e expõe o promise para o teste aguardar.
let afterPromise: Promise<unknown> | null = null
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: (fn: () => Promise<unknown>) => { afterPromise = fn() } }
})

const getReceivableBillMock = vi.fn()
const getFinancialStatementMock = vi.fn()
vi.mock("@web/lib/integrations/sienge/client", () => ({
  getReceivableBill: (...a: unknown[]) => getReceivableBillMock(...a),
  getFinancialStatement: (...a: unknown[]) => getFinancialStatementMock(...a),
}))

const notifyNovoBoletoMock = vi.fn()
vi.mock("@web/lib/notificacoes", () => ({
  notifyNovoBoleto: (...a: unknown[]) => notifyNovoBoletoMock(...a),
}))

// Estado configurável do banco mockado.
let claimResult: boolean | null = true
let obraRow: Record<string, unknown> | null = { id: "obra-1", name: "VIND Residence", org_id: "org-1" }
let usersRows: Record<string, unknown>[] = [{ id: "user-1", name: "João", email: "joao@ex.com", phone: "5544999999999" }]
let vinculoRow: Record<string, unknown> | null = { obra_id: "obra-1" }
const rpcMock = vi.fn((name: string, args: unknown) => {
  void name; void args
  return Promise.resolve({ data: claimResult, error: null })
})

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        delete: () => builder,
        maybeSingle: async () =>
          table === "obras"
            ? { data: obraRow, error: null }
            : table === "cliente_obras"
              ? { data: vinculoRow, error: null }
              : { data: null, error: null },
        // users query é awaited direto (sem maybeSingle) → thenable
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: table === "users" ? usersRows : null, error: null }),
      }
      return builder
    },
  }),
}))

import { NextRequest } from "next/server"
import { POST } from "./route"

function makeReq(opts: {
  token?: string
  event?: string
  body?: unknown
}): NextRequest {
  const url = `https://crm.trifold.eng.br/api/webhooks/sienge${opts.token !== undefined ? `?token=${opts.token}` : ""}`
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.event ? { "x-sienge-event": opts.event } : {}),
      "x-sienge-id": "evt-123",
    },
    body: JSON.stringify(opts.body ?? {}),
  })
}

const CONFIRMED_BODY = { receivableBillId: 11045, installmentId: 1, status: "CONFIRMED" }

beforeEach(() => {
  vi.clearAllMocks()
  afterPromise = null
  claimResult = true
  obraRow = { id: "obra-1", name: "VIND Residence", org_id: "org-1" }
  usersRows = [{ id: "user-1", name: "João", email: "joao@ex.com", phone: "5544999999999" }]
  vinculoRow = { obra_id: "obra-1" }
  process.env.SIENGE_WEBHOOK_TOKEN = "segredo"
  getReceivableBillMock.mockResolvedValue({
    receivableBillId: 11045,
    customerId: 1510,
    enterpriseCode: 8,
    enterpriseName: "VIND Residence",
  })
  getFinancialStatementMock.mockResolvedValue([
    { billReceivableId: 11045, installmentId: 1, dueDate: "2026-04-27" },
  ])
})

describe("POST /api/webhooks/sienge", () => {
  it("AC4: token inválido → 401, sem processar", async () => {
    const res = await POST(makeReq({ token: "errado", event: "PAYMENT_SLIP_REGISTERED", body: CONFIRMED_BODY }))
    expect(res.status).toBe(401)
    expect(afterPromise).toBeNull()
  })

  it("AC3: status REJECTED → 200 ignorado, sem disparo", async () => {
    const res = await POST(makeReq({ token: "segredo", event: "PAYMENT_SLIP_REGISTERED", body: { ...CONFIRMED_BODY, status: "REJECTED" } }))
    expect(res.status).toBe(200)
    expect(afterPromise).toBeNull()
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })

  it("AC3: outro evento → 200 ignorado", async () => {
    const res = await POST(makeReq({ token: "segredo", event: "CUSTOMER_CREATED", body: { customerId: 1 } }))
    expect(res.status).toBe(200)
    expect(afterPromise).toBeNull()
  })

  it("AC1: CONFIRMED mapeável → dispara notifyNovoBoleto com vencimento formatado", async () => {
    const res = await POST(makeReq({ token: "segredo", event: "PAYMENT_SLIP_REGISTERED", body: CONFIRMED_BODY }))
    expect(res.status).toBe(200)
    await afterPromise
    expect(notifyNovoBoletoMock).toHaveBeenCalledTimes(1)
    expect(notifyNovoBoletoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        obraId: "obra-1",
        obraName: "VIND Residence",
        vencimento: "27/04/2026",
      })
    )
  })

  it("AC2: evento duplicado (claim não concedido) → não dispara", async () => {
    claimResult = null
    await POST(makeReq({ token: "segredo", event: "PAYMENT_SLIP_REGISTERED", body: CONFIRMED_BODY }))
    await afterPromise
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })

  it("AC5: customer sem vínculo na obra → não dispara, sem erro", async () => {
    vinculoRow = null
    await POST(makeReq({ token: "segredo", event: "PAYMENT_SLIP_REGISTERED", body: CONFIRMED_BODY }))
    await afterPromise
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })
})
