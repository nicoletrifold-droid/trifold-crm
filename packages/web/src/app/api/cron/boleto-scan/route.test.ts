/**
 * Story 75-101 — Testes do cron de varredura de boletos.
 *
 * Cobre: auth (401), pausa do portal, disparo de 1 notificação por boleto inédito,
 * anti-flood (N boletos inéditos no mesmo cliente → 1 msg só) e dedup (claim negado
 * → não notifica).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const getFinancialStatementMock = vi.fn()
const getReceivableBillMock = vi.fn()
vi.mock("@web/lib/integrations/sienge/client", () => ({
  getFinancialStatement: (...a: unknown[]) => getFinancialStatementMock(...a),
  getReceivableBill: (...a: unknown[]) => getReceivableBillMock(...a),
}))

const notifyNovoBoletoMock = vi.fn()
let paused = false
vi.mock("@web/lib/notificacoes", () => ({
  notifyNovoBoleto: (...a: unknown[]) => notifyNovoBoletoMock(...a),
  portalNotificacoesPausadas: () => paused,
}))

// Estado configurável do banco mockado.
let clientesRows: Record<string, unknown>[] = []
let obraRow: Record<string, unknown> | null = { id: "obra-1", name: "Yarden", org_id: "org-1" }
let vinculoRow: Record<string, unknown> | null = { obra_id: "obra-1" }
// claim_sienge_webhook: retorna o próximo valor da fila (ou o default se a fila esvaziar).
let claimQueue: (boolean | null)[] = []
let claimDefault: boolean | null = true
const rpcMock = vi.fn((name: string, args: unknown) => {
  void name; void args
  const v = claimQueue.length ? claimQueue.shift()! : claimDefault
  return Promise.resolve({ data: v, error: null })
})

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        delete: () => builder,
        maybeSingle: async () =>
          table === "obras"
            ? { data: obraRow, error: null }
            : table === "cliente_obras"
              ? { data: vinculoRow, error: null }
              : { data: null, error: null },
        // users (lista) e sienge_webhook_dedup.delete() são awaited direto → thenable.
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: table === "users" ? clientesRows : null, error: null }),
      }
      return builder
    },
  }),
}))

import { NextRequest } from "next/server"
import { GET } from "./route"

function makeReq(token?: string): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/cron/boleto-scan", {
    method: "GET",
    headers: token !== undefined ? { authorization: `Bearer ${token}` } : {},
  })
}

const CLIENTE = { id: "user-1", name: "Albert", email: "a@ex.com", phone: "5544999999999", sienge_customer_id: 1510 }

beforeEach(() => {
  vi.clearAllMocks()
  paused = false
  clientesRows = [CLIENTE]
  obraRow = { id: "obra-1", name: "Yarden", org_id: "org-1" }
  vinculoRow = { obra_id: "obra-1" }
  claimQueue = []
  claimDefault = true
  process.env.CRON_SECRET = "segredo"
  getReceivableBillMock.mockResolvedValue({ customerId: 1510, enterpriseCode: 8, enterpriseName: "Yarden" })
  getFinancialStatementMock.mockResolvedValue([
    { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 2305.27, generatedBillet: true },
  ])
})

describe("GET /api/cron/boleto-scan", () => {
  it("AC6: sem Bearer CRON_SECRET → 401", async () => {
    const res = await GET(makeReq("errado"))
    expect(res.status).toBe(401)
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })

  it("AC4: PORTAL_NOTIF_PAUSED → não envia nada", async () => {
    paused = true
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.paused).toBe(true)
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })

  it("AC1: boleto inédito mapeável → 1 notificação com vencimento formatado", async () => {
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.notified).toBe(1)
    expect(notifyNovoBoletoMock).toHaveBeenCalledTimes(1)
    expect(notifyNovoBoletoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        obraId: "obra-1",
        obraName: "Yarden",
        vencimento: "10/07/2026",
      })
    )
  })

  it("AC2: N boletos inéditos no mesmo cliente → só 1 notificação (resto suprimido)", async () => {
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
      { billReceivableId: 11045, installmentId: 12, dueDate: "2026-08-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
      { billReceivableId: 11046, installmentId: 5, dueDate: "2026-06-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.notified).toBe(1)
    expect(json.suppressed).toBe(2)
    expect(notifyNovoBoletoMock).toHaveBeenCalledTimes(1)
    // Ordena por vencimento asc → a mais antiga (2026-06-10) é a enviada.
    expect(notifyNovoBoletoMock).toHaveBeenCalledWith(
      expect.objectContaining({ vencimento: "10/06/2026" })
    )
  })

  it("AC3: parcela já deduplicada (claim negado) → não notifica", async () => {
    claimDefault = null
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.notified).toBe(0)
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })

  it("ignora parcelas sem boleto gerado / sem saldo (hasBoleto=false)", async () => {
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 1, installmentId: 1, dueDate: "2026-07-10", hasBoleto: false, currentBalance: 0, generatedBillet: false },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.notified).toBe(0)
    expect(notifyNovoBoletoMock).not.toHaveBeenCalled()
  })
})
