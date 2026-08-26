/**
 * Story 75-284 — Extrato: baixa parcial não pode virar "Pago".
 *
 * Caso real de referência (CT.VIND-704): parcela "Entrega das chaves" de
 * R$ 397.600,00 com baixas parciais somando R$ 24.424,38 e saldo devedor de
 * R$ 434.518,33 aparecia como "Pago" no extrato do portal, zerando o
 * "Total em aberto" do cliente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import {
  getFinancialStatement,
  computeInformeFromStatements,
  getOpenBalance,
  collectUnknownReceiptTypes,
} from "./client"
import type { SiengeInstallment } from "./types"

function makeInstallment(overrides: Partial<SiengeInstallment>): SiengeInstallment {
  return {
    installmentId: 1,
    installmentNumber: "1",
    dueDate: "2027-02-28",
    conditionType: "CH",
    originalValue: 397600,
    currentBalance: 0,
    generatedBillet: false,
    receipts: [],
    ...overrides,
  }
}

function mockStatementResponse(installments: SiengeInstallment[]) {
  const body = {
    results: [
      {
        billsReceivable: [
          { billReceivableId: 10663, documentId: "CT.VIND-704", finePercent: 0, interestPercent: 0, installments },
        ],
      },
    ],
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  )
}

describe("getFinancialStatement — status por saldo devedor", () => {
  beforeEach(() => {
    vi.stubEnv("SIENGE_SUBDOMAIN", "trifold")
    vi.stubEnv("SIENGE_USERNAME", "user")
    vi.stubEnv("SIENGE_PASSWORD", "pass")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("parcela quitada (baixas e saldo zero) → PAGO, com data da última baixa", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        receipts: [
          { receiptDate: "2026-06-16", receiptValue: 200000 },
          { receiptDate: "2026-07-28", receiptValue: 197600 },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1403)
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(397600)
    expect(inst.receiptDate).toBe("2026-07-28")
    expect(inst.receipts).toHaveLength(2)
  })

  it("baixa parcial com saldo devedor → PARCIAL, nunca PAGO (caso Entrega das chaves)", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 434518.33,
        generatedBillet: true,
        receipts: [
          { receiptDate: "2026-06-16", receiptValue: 4509.12 },
          { receiptDate: "2026-07-21", receiptValue: 10142.0 },
          { receiptDate: "2026-07-28", receiptValue: 5496.5 },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1403)
    expect(inst.status).toBe("PARCIAL")
    expect(inst.receiptValue).toBeCloseTo(20147.62)
    expect(inst.currentBalance).toBeCloseTo(434518.33)
    // Ainda deve: boleto do saldo continua acessível
    expect(inst.hasBoleto).toBe(true)
  })

  it("ordena baixas por data mesmo se a API vier fora de ordem", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 100,
        receipts: [
          { receiptDate: "2026-07-28", receiptValue: 2 },
          { receiptDate: "2026-06-16", receiptValue: 1 },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1403)
    expect(inst.receipts.map((r) => r.receiptDate)).toEqual(["2026-06-16", "2026-07-28"])
    expect(inst.receiptDate).toBe("2026-07-28")
  })

  it("sem baixa: boleto gerado → BOLETO_GERADO; sem boleto → EM_ABERTO", async () => {
    mockStatementResponse([
      makeInstallment({ installmentId: 1, currentBalance: 1000, generatedBillet: true }),
      makeInstallment({ installmentId: 2, currentBalance: 1000, generatedBillet: false }),
    ])

    const [comBoleto = null!, semBoleto = null!] = await getFinancialStatement(1403)
    expect(comBoleto.status).toBe("BOLETO_GERADO")
    expect(semBoleto.status).toBe("EM_ABERTO")
    expect(comBoleto.receiptDate).toBeUndefined()
    expect(comBoleto.receiptValue).toBeUndefined()
  })
})

describe("computeInformeFromStatements — baixas nos meses reais", () => {
  const base = {
    billReceivableId: 10663,
    documentId: "CT.VIND-704",
    installmentId: 33,
    installmentNumber: "33",
    dueDate: "2027-02-28",
    conditionType: "CH" as const,
    originalValue: 397600,
    generatedBillet: false,
    hasBoleto: false,
    nonCashReceipts: [],
  }

  it("parcela com baixas em meses diferentes distribui cada baixa no seu mês", () => {
    const informe = computeInformeFromStatements(
      [
        {
          ...base,
          currentBalance: 434518.33,
          status: "PARCIAL",
          receipts: [
            { receiptDate: "2026-06-16", receiptValue: 4509.12 },
            { receiptDate: "2026-07-21", receiptValue: 10142.0 },
          ],
          receiptDate: "2026-07-21",
          receiptValue: 14651.12,
        },
      ],
      2026
    )

    expect(informe.monthlyBreakdown).toHaveLength(2)
    expect(informe.monthlyBreakdown[0]).toMatchObject({ month: 6, value: 4509.12 })
    expect(informe.monthlyBreakdown[1]).toMatchObject({ month: 7, value: 10142.0 })
    expect(informe.totalPaidInYear).toBeCloseTo(14651.12)
    // O que já foi baixado conta como pago acumulado…
    expect(informe.accumulatedPaid).toBeCloseTo(14651.12)
    // …e o saldo devedor da parcela parcial permanece em aberto.
    expect(informe.remainingBalance).toBeCloseTo(434518.33)
  })

  it("baixa de ano anterior fica fora do informe do ano", () => {
    const informe = computeInformeFromStatements(
      [
        {
          ...base,
          currentBalance: 0,
          status: "PAGO",
          receipts: [
            { receiptDate: "2025-12-30", receiptValue: 100 },
            { receiptDate: "2026-01-05", receiptValue: 200 },
          ],
          receiptDate: "2026-01-05",
          receiptValue: 300,
        },
      ],
      2026
    )

    expect(informe.monthlyBreakdown).toHaveLength(1)
    expect(informe.monthlyBreakdown[0]).toMatchObject({ month: 1, value: 200 })
    expect(informe.totalPaidInYear).toBe(200)
    expect(informe.accumulatedPaid).toBe(300)
    expect(informe.remainingBalance).toBe(0)
  })
})

/**
 * Reparcelamento: o Sienge baixa a parcela antiga com
 * `receiptType: "Reparcelamento"` e gera novas parcelas com o saldo. Tratar
 * isso como pagamento contava a mesma dívida duas vezes.
 *
 * Caso real (CT.YAR-1301, cliente 1469): 13 baixas de "Recebimento" somando
 * R$ 115.786,94 — o total do extrato oficial do Sienge — e 75 baixas de
 * "Reparcelamento" somando R$ 423.317,28. O portal exibia a soma das duas,
 * R$ 539.104,22.
 */
describe("getFinancialStatement — reparcelamento não é pagamento", () => {
  beforeEach(() => {
    vi.stubEnv("SIENGE_SUBDOMAIN", "trifold")
    vi.stubEnv("SIENGE_USERNAME", "user")
    vi.stubEnv("SIENGE_PASSWORD", "pass")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("baixa só de Reparcelamento → RENEGOCIADA, sem valor pago", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        originalValue: 2000,
        receipts: [
          { receiptDate: "2025-12-06", receiptValue: 2000, receiptType: "Reparcelamento" },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("RENEGOCIADA")
    expect(inst.receiptValue).toBeUndefined()
    expect(inst.receiptDate).toBeUndefined()
    expect(inst.receipts).toHaveLength(0)
    expect(inst.nonCashReceipts).toHaveLength(1)
    // Não é dívida: já está representada nas parcelas que a substituíram.
    expect(getOpenBalance(inst)).toBe(0)
  })

  it("baixa de Recebimento continua contando como pagamento", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        originalValue: 10000,
        receipts: [
          { receiptDate: "2025-11-03", receiptValue: 10000, receiptType: "Recebimento" },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(10000)
    expect(getOpenBalance(inst)).toBe(0)
  })

  it("receiptType ausente conta como pagamento (não sumir com valor legítimo)", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        receipts: [{ receiptDate: "2026-01-10", receiptValue: 500 }],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(500)
  })

  it("pagamento em dinheiro + reparcelamento posterior: só o dinheiro conta", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        originalValue: 3000,
        receipts: [
          { receiptDate: "2026-01-10", receiptValue: 1000, receiptType: "Recebimento" },
          { receiptDate: "2026-02-10", receiptValue: 2000, receiptType: "Reparcelamento" },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(1000)
    expect(inst.nonCashReceipts).toHaveLength(1)
  })

  it("grafia com acento/maiúsculas é reconhecida", async () => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        receipts: [{ receiptDate: "2026-01-10", receiptValue: 900, receiptType: "REPARCELAMENTO" }],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("RENEGOCIADA")
    expect(inst.receiptValue).toBeUndefined()
  })

  it("informe do ano ignora reparcelamento e não ressuscita a dívida no saldo", async () => {
    mockStatementResponse([
      // Paga de verdade em 2026
      makeInstallment({
        installmentId: 1,
        currentBalance: 0,
        originalValue: 10000,
        receipts: [
          { receiptDate: "2026-01-15", receiptValue: 10000, receiptType: "Recebimento" },
        ],
      }),
      // Renegociada em 2026 — não é rendimento nem saldo
      makeInstallment({
        installmentId: 2,
        currentBalance: 0,
        originalValue: 90000,
        receipts: [
          { receiptDate: "2026-02-20", receiptValue: 90000, receiptType: "Reparcelamento" },
        ],
      }),
      // Parcela nova gerada pelo acordo, ainda em aberto
      makeInstallment({ installmentId: 3, currentBalance: 95000, originalValue: 90000 }),
    ])

    const installments = await getFinancialStatement(1469)
    const informe = computeInformeFromStatements(installments, 2026)

    expect(informe.totalPaidInYear).toBe(10000)
    expect(informe.accumulatedPaid).toBe(10000)
    // Só a parcela nova — a renegociada (saldo 0) não pode virar originalValue.
    expect(informe.remainingBalance).toBe(95000)
    expect(informe.monthlyBreakdown).toHaveLength(1)
    expect(informe.monthlyBreakdown[0]).toMatchObject({ month: 1, value: 10000 })
  })
})

describe("collectUnknownReceiptTypes", () => {
  it("aponta tipos de baixa ainda não classificados", () => {
    const base = {
      billReceivableId: 1,
      documentId: "CT.X",
      installmentId: 1,
      installmentNumber: "1",
      dueDate: "2026-01-01",
      conditionType: "PM" as const,
      originalValue: 100,
      currentBalance: 0,
      generatedBillet: false,
      hasBoleto: false,
      status: "PAGO" as const,
      nonCashReceipts: [],
    }

    expect(
      collectUnknownReceiptTypes([
        { ...base, receipts: [{ receiptDate: "2026-01-01", receiptValue: 100, receiptType: "Recebimento" }] },
        { ...base, receipts: [{ receiptDate: "2026-01-01", receiptValue: 100, receiptType: "Dação em pagamento" }] },
      ])
    ).toEqual(["Dação em pagamento"])
  })
})
