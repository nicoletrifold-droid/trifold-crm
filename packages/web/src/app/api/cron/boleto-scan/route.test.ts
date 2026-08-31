/**
 * Story 75-101 — Testes do cron de varredura de boletos.
 *
 * Cobre: auth (401), pausa do portal, disparo de 1 notificação por boleto inédito,
 * anti-flood (N boletos inéditos no mesmo cliente → 1 msg só) e dedup (claim negado
 * → não notifica).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const getFinancialStatementMock = vi.fn()
const getReceivableBillMock = vi.fn()
vi.mock("@web/lib/integrations/sienge/client", () => ({
  getFinancialStatement: (...a: unknown[]) => getFinancialStatementMock(...a),
  getReceivableBill: (...a: unknown[]) => getReceivableBillMock(...a),
}))

const notifyNovoBoletoMock = vi.fn()
const notifyBoletoLembreteMock = vi.fn()
let paused = false
vi.mock("@web/lib/notificacoes", () => ({
  notifyNovoBoleto: (...a: unknown[]) => notifyNovoBoletoMock(...a),
  notifyBoletoLembrete: (...a: unknown[]) => notifyBoletoLembreteMock(...a),
  portalNotificacoesPausadas: () => paused,
}))

// Estado configurável do banco mockado.
let clientesRows: Record<string, unknown>[] = []
let obraRow: Record<string, unknown> | null = { id: "obra-1", name: "Yarden", org_id: "org-1" }
let vinculoRow: Record<string, unknown> | null = { obra_id: "obra-1" }
// Story 75-147 — resolução de obra por enterpriseCode (multi-obra). Se vazio, cai no obraRow.
let obraByEnterprise: Record<number, Record<string, unknown> | null> = {}
// claim_sienge_webhook: retorna, por ordem de prioridade, o valor mapeado à event_key
// (claimByKey), depois o próximo da fila, depois o default.
let claimQueue: (boolean | null)[] = []
let claimDefault: boolean | null = true
let claimByKey: Record<string, boolean | null> = {}
const rpcMock = vi.fn((name: string, args: unknown) => {
  void name
  const key = (args as { p_event_key?: string })?.p_event_key
  if (key && Object.prototype.hasOwnProperty.call(claimByKey, key)) {
    return Promise.resolve({ data: claimByKey[key], error: null })
  }
  const v = claimQueue.length ? claimQueue.shift()! : claimDefault
  return Promise.resolve({ data: v, error: null })
})

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return builder
        },
        is: () => builder,
        not: () => builder,
        delete: () => builder,
        maybeSingle: async () =>
          table === "obras"
            ? {
                data:
                  (filters.sienge_enterprise_id as number) in obraByEnterprise
                    ? obraByEnterprise[filters.sienge_enterprise_id as number]
                    : obraRow,
                error: null,
              }
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
  // Fake apenas Date (setTimeout real → o sleep() do route continua funcionando). Default:
  // 18 UTC = 15 BRT → passo de lembretes NÃO roda; testes de novo-boleto ficam determinísticos.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-07-06T18:00:00Z"))
  paused = false
  clientesRows = [CLIENTE]
  obraRow = { id: "obra-1", name: "Yarden", org_id: "org-1" }
  vinculoRow = { obra_id: "obra-1" }
  obraByEnterprise = {}
  claimQueue = []
  claimDefault = true
  claimByKey = {}
  process.env.CRON_SECRET = "segredo"
  getReceivableBillMock.mockResolvedValue({ customerId: 1510, enterpriseCode: 8, enterpriseName: "Yarden" })
  getFinancialStatementMock.mockResolvedValue([
    { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 2305.27, generatedBillet: true },
  ])
})

afterEach(() => {
  vi.useRealTimers()
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

// Story 75-141 — passo de lembretes (venc_hoje / atraso5 / atraso15).
// 12 UTC = 09 BRT (roda lembretes); 18 UTC = 15 BRT (só novo-boleto).
describe("GET /api/cron/boleto-scan — lembretes (Story 75-141)", () => {
  const NOVE_BRT = "2026-07-10T12:00:00Z" // 09:00 BRT

  it("AC1: dueDate == hoje (diff 0) na rodada das 09 BRT → lembrete venc_hoje com chave prefixada", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretes).toBe(true)
    expect(json.lembretesVenc).toBe(1)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledTimes(1)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledWith(
      expect.objectContaining({ marco: "venc_hoje", obraId: "obra-1", vencimento: "10/07/2026", quantidade: 1 })
    )
    // Story 75-147: chave de dedup por (marco, obra, vencimento) + event_type informativo.
    expect(rpcMock).toHaveBeenCalledWith(
      "claim_sienge_webhook",
      expect.objectContaining({ p_event_key: "venc_hoje:obra-1:user-1:2026-07-10", p_event_type: "BOLETO_LEMBRETE_VENC" })
    )
  })

  it("AC2: diff 5 → atraso5 e diff 15 → atraso15 (datas certas)", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 5, dueDate: "2026-07-05", hasBoleto: true, currentBalance: 100, generatedBillet: true }, // diff 5
      { billReceivableId: 11045, installmentId: 15, dueDate: "2026-06-25", hasBoleto: true, currentBalance: 100, generatedBillet: true }, // diff 15
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretesAtraso5).toBe(1)
    expect(json.lembretesAtraso15).toBe(1)
    const marcos = notifyBoletoLembreteMock.mock.calls.map((c) => (c[0] as { marco: string }).marco)
    expect(marcos).toEqual(expect.arrayContaining(["atraso5", "atraso15"]))
    expect(rpcMock).toHaveBeenCalledWith(
      "claim_sienge_webhook",
      expect.objectContaining({ p_event_key: "atraso5:obra-1:user-1:2026-07-05", p_event_type: "BOLETO_LEMBRETE_ATRASO5" })
    )
    expect(rpcMock).toHaveBeenCalledWith(
      "claim_sienge_webhook",
      expect.objectContaining({ p_event_key: "atraso15:obra-1:user-1:2026-06-25", p_event_type: "BOLETO_LEMBRETE_ATRASO15" })
    )
  })

  it("AC3: diff=16 (qualquer diff ∉ {0,5,15}) → nenhum lembrete", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 16, dueDate: "2026-06-24", hasBoleto: true, currentBalance: 100, generatedBillet: true }, // diff 16
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretesVenc + json.lembretesAtraso5 + json.lembretesAtraso15).toBe(0)
    expect(notifyBoletoLembreteMock).not.toHaveBeenCalled()
  })

  it("AC4: hasBoleto=false (parcela paga) → nenhum lembrete mesmo caindo em marco", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: false, currentBalance: 0, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    await res.json()
    expect(notifyBoletoLembreteMock).not.toHaveBeenCalled()
  })

  it("AC5: claim do marco negado → não re-notifica aquele marco", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    claimByKey = { "venc_hoje:obra-1:user-1:2026-07-10": null } // grupo já enviado antes
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretesVenc).toBe(0)
    expect(notifyBoletoLembreteMock).not.toHaveBeenCalled()
    // O novo-boleto (chave sem prefixo) é independente → segue notificando.
    expect(notifyNovoBoletoMock).toHaveBeenCalledTimes(1)
  })

  it("AC6: rodada das 18 BRT (21 UTC) → NENHUM lembrete, mas novo-boleto roda normalmente", async () => {
    vi.setSystemTime(new Date("2026-07-10T21:00:00Z")) // 18 BRT — 2ª rodada do dia
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretes).toBe(false)
    expect(notifyBoletoLembreteMock).not.toHaveBeenCalled()
    // Não-regressão: novo-boleto continua rodando em TODAS as rodadas agendadas.
    expect(json.notified).toBe(1)
    expect(notifyNovoBoletoMock).toHaveBeenCalledTimes(1)
  })

  it("AC6/não-regressão: rodada das 09 BRT avalia lembretes E mantém novo-boleto 1×/parcela", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 11, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    // Novo-boleto: 1 envio (não regrediu com o passo aditivo de lembretes).
    expect(json.notified).toBe(1)
    expect(notifyNovoBoletoMock).toHaveBeenCalledTimes(1)
    // Lembrete: também avaliado na mesma rodada.
    expect(json.lembretesVenc).toBe(1)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledTimes(1)
  })
})

// Story 75-147 — agrupar lembretes do mesmo cliente+obra+marco em 1 mensagem.
describe("GET /api/cron/boleto-scan — agrupamento de lembretes (Story 75-147)", () => {
  const NOVE_BRT = "2026-07-10T12:00:00Z" // 09:00 BRT

  it("AC1: N boletos do mesmo cliente+obra no mesmo marco/dia → 1 notificação com quantidade=N", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 6, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
      { billReceivableId: 11045, installmentId: 33, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
      { billReceivableId: 11045, installmentId: 34, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    // 1 mensagem só, com a contagem correta.
    expect(json.lembretesVenc).toBe(1)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledTimes(1)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledWith(
      expect.objectContaining({ marco: "venc_hoje", obraId: "obra-1", vencimento: "10/07/2026", quantidade: 3 })
    )
    // 1 claim de lembrete por grupo (chave por marco+obra+vencimento).
    const lembreteClaims = rpcMock.mock.calls.filter(
      (c) => (c[1] as { p_event_key?: string })?.p_event_key === "venc_hoje:obra-1:user-1:2026-07-10"
    )
    expect(lembreteClaims).toHaveLength(1)
  })

  it("AC2: boletos em OBRAS diferentes (mesmo marco) → 1 mensagem por obra", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    obraByEnterprise = {
      8: { id: "obra-1", name: "Yarden", org_id: "org-1" },
      9: { id: "obra-2", name: "Aurora", org_id: "org-1" },
    }
    getReceivableBillMock.mockImplementation((id: number) =>
      Promise.resolve({ customerId: 1510, enterpriseCode: id === 22222 ? 9 : 8, enterpriseName: "x" })
    )
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 6, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
      { billReceivableId: 22222, installmentId: 6, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true },
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretesVenc).toBe(2)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledTimes(2)
    const obras = notifyBoletoLembreteMock.mock.calls.map((c) => (c[0] as { obraId: string }).obraId)
    expect(obras).toEqual(expect.arrayContaining(["obra-1", "obra-2"]))
    // Cada obra é um grupo de quantidade 1.
    for (const call of notifyBoletoLembreteMock.mock.calls) {
      expect((call[0] as { quantidade: number }).quantidade).toBe(1)
    }
  })

  it("AC3: marcos diferentes na mesma obra → 1 mensagem por marco", async () => {
    vi.setSystemTime(new Date(NOVE_BRT))
    getFinancialStatementMock.mockResolvedValue([
      { billReceivableId: 11045, installmentId: 6, dueDate: "2026-07-10", hasBoleto: true, currentBalance: 100, generatedBillet: true }, // venc_hoje
      { billReceivableId: 11045, installmentId: 9, dueDate: "2026-07-05", hasBoleto: true, currentBalance: 100, generatedBillet: true }, // atraso5
    ])
    const res = await GET(makeReq("segredo"))
    const json = await res.json()
    expect(json.lembretesVenc).toBe(1)
    expect(json.lembretesAtraso5).toBe(1)
    expect(notifyBoletoLembreteMock).toHaveBeenCalledTimes(2)
    const marcos = notifyBoletoLembreteMock.mock.calls.map((c) => (c[0] as { marco: string }).marco)
    expect(marcos).toEqual(expect.arrayContaining(["venc_hoje", "atraso5"]))
  })
})

// Cadência do cron (31/08/2026) — guarda de custo, não de comportamento.
//
// Esta varredura custa 1 chamada ao Sienge por cliente ativo (~165) POR RODADA, e a cota
// da assinatura é de 1.000/dia compartilhada com todo o resto do CRM. Com 4 rodadas ela
// sozinha consumia ~4/5 da conta e gerava excedente. Voltar a subir a frequência aqui é
// barato de escrever e caro de descobrir — daí o teste.
describe("boleto-scan · cadência do cron", () => {
  it("mantém 2 rodadas/dia (12 e 21 UTC = 09 e 18 BRT) no vercel.json", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")

    const vercelJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "packages/web/vercel.json"), "utf-8")
    ) as { crons: Array<{ path: string; schedule: string }> }

    const cron = vercelJson.crons.find((c) => c.path === "/api/cron/boleto-scan")
    expect(cron, "cron do boleto-scan sumiu do vercel.json").toBeDefined()

    const horas = cron!.schedule.split(" ")[1]!.split(",")
    expect(horas).toEqual(["12", "21"])

    // A rodada das 12 UTC (09 BRT) é a única que dispara lembretes (Story 75-141).
    // Se ela sair, os lembretes de vencimento/atraso param silenciosamente.
    expect(horas).toContain("12")
  })
})
