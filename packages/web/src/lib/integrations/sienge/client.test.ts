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
  getNonCashLabel,
  getCashReceiptValue,
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

/**
 * Story 75-369 — só "Recebimento" e "Abatimento de Adiantamento" são pagamento.
 *
 * Decisão do financeiro (28/08/2026) depois da varredura da base completa: dos
 * 11 tipos de baixa que o Sienge registra, os outros 9 são baixa contábil e
 * somavam R$ 155,7 milhões a mais no "total pago" exibido no portal.
 */
describe("getFinancialStatement — tipos de baixa que contam como pagamento", () => {
  beforeEach(() => {
    vi.stubEnv("SIENGE_SUBDOMAIN", "trifold")
    vi.stubEnv("SIENGE_USERNAME", "user")
    vi.stubEnv("SIENGE_PASSWORD", "pass")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function statusFor(receiptType: string | undefined) {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        originalValue: 1000,
        receipts: [{ receiptDate: "2026-03-10", receiptValue: 1000, receiptType }],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    return inst
  }

  it.each(["Recebimento", "Abatimento de Adiantamento"])(
    "%s conta como pagamento",
    async (tipo) => {
      const inst = await statusFor(tipo)
      expect(inst.status).toBe("PAGO")
      expect(inst.receiptValue).toBe(1000)
      expect(inst.nonCashReceipts).toHaveLength(0)
    }
  )

  it.each([
    "Reparcelamento",
    "Substituição",
    "Cancelamento",
    "Adiantamento",
    "Distrato",
    "Outros",
    "Bonificação",
    "Repactuação",
    "Outros com Resíduo",
  ])("%s NÃO conta como pagamento", async (tipo) => {
    const inst = await statusFor(tipo)
    expect(inst.status).toBe("RENEGOCIADA")
    expect(inst.receiptValue).toBeUndefined()
    expect(inst.receipts).toHaveLength(0)
    expect(inst.nonCashReceipts).toHaveLength(1)
    // Saldo não muda em nenhum cenário: a parcela não volta a ser dívida.
    expect(getOpenBalance(inst)).toBe(0)
  })

  it("tipo desconhecido NÃO conta como pagamento — default restritivo", async () => {
    const inst = await statusFor("Dação em Pagamento")
    expect(inst.status).toBe("RENEGOCIADA")
    expect(inst.receiptValue).toBeUndefined()
    expect(inst.nonCashReceipts).toHaveLength(1)
    // E fica visível para auditoria, para o financeiro classificar o tipo novo.
    expect(collectUnknownReceiptTypes([inst])).toEqual(["Dação em Pagamento"])
  })

  it("grafia sem acento, em caixa alta e com espaço extra é reconhecida", async () => {
    const inst = await statusFor("  ABATIMENTO  DE ADIANTAMENTO ")
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(1000)
  })

  it("adiantamento + abatimento na mesma parcela: só o abatimento conta", async () => {
    // O dinheiro do adiantamento entra uma única vez, no momento em que quita a
    // parcela. Contar os dois dobraria o valor.
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        originalValue: 5000,
        receipts: [
          { receiptDate: "2026-01-05", receiptValue: 5000, receiptType: "Adiantamento" },
          {
            receiptDate: "2026-02-05",
            receiptValue: 5000,
            receiptType: "Abatimento de Adiantamento",
          },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(5000)
    expect(inst.nonCashReceipts).toHaveLength(1)
  })

  it("recebimento + repactuação: só o recebimento entra no total pago", async () => {
    // Caso mais comum da base: 1.601 repactuações, todas acompanhando um
    // recebimento na mesma parcela — é ajuste, não um segundo pagamento.
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        originalValue: 2795.95,
        receipts: [
          { receiptDate: "2007-01-23", receiptValue: 2795.95, receiptType: "Recebimento" },
          { receiptDate: "2007-01-23", receiptValue: 35.15, receiptType: "Repactuação" },
        ],
      }),
    ])

    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("PAGO")
    expect(inst.receiptValue).toBe(2795.95)
  })

  it("informe do ano soma abatimento de adiantamento e ignora o adiantamento", async () => {
    mockStatementResponse([
      makeInstallment({
        installmentId: 1,
        currentBalance: 0,
        originalValue: 8000,
        receipts: [
          { receiptDate: "2026-01-15", receiptValue: 8000, receiptType: "Adiantamento" },
        ],
      }),
      makeInstallment({
        installmentId: 2,
        currentBalance: 0,
        originalValue: 8000,
        receipts: [
          {
            receiptDate: "2026-02-15",
            receiptValue: 8000,
            receiptType: "Abatimento de Adiantamento",
          },
        ],
      }),
    ])

    const installments = await getFinancialStatement(1469)
    const informe = computeInformeFromStatements(installments, 2026)

    expect(informe.totalPaidInYear).toBe(8000)
    expect(informe.monthlyBreakdown).toHaveLength(1)
    expect(informe.monthlyBreakdown[0]).toMatchObject({ month: 2, value: 8000 })
  })
})

describe("getNonCashLabel — rótulo pelo tipo real da baixa", () => {
  beforeEach(() => {
    vi.stubEnv("SIENGE_SUBDOMAIN", "trifold")
    vi.stubEnv("SIENGE_USERNAME", "user")
    vi.stubEnv("SIENGE_PASSWORD", "pass")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each([
    ["Reparcelamento", "Renegociada"],
    ["Substituição", "Substituída"],
    ["Cancelamento", "Cancelada"],
    ["Adiantamento", "Adiantamento"],
    ["Distrato", "Distratada"],
    ["Bonificação", "Bonificada"],
    ["Repactuação", "Repactuada"],
    ["Outros", "Baixada"],
    ["Outros com Resíduo", "Baixada"],
    ["Dação em Pagamento", "Baixada"],
  ])("%s → %s", async (tipo, esperado) => {
    mockStatementResponse([
      makeInstallment({
        currentBalance: 0,
        receipts: [{ receiptDate: "2026-03-10", receiptValue: 100, receiptType: tipo }],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(getNonCashLabel(inst)).toBe(esperado)
  })
})

/**
 * Story 75-370 — o total pago passa a ser o Recto líquido: juros de atraso pagos
 * pelo cliente entram, desconto concedido sai (decisão do financeiro, 31/08/2026).
 *
 * Números conferidos contra a API de produção em 31/08/2026 (1.299 baixas do Vind
 * e do Yarden): `netReceiptValue` == valor + juros + adicional − desconto em
 * 1.299 de 1.299 casos.
 */
describe("getFinancialStatement — total pago pelo Recto líquido", () => {
  beforeEach(() => {
    vi.stubEnv("SIENGE_SUBDOMAIN", "trifold")
    vi.stubEnv("SIENGE_USERNAME", "user")
    vi.stubEnv("SIENGE_PASSWORD", "pass")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("parcela paga em atraso: juros entram, pago fica ACIMA do valor da parcela e o status segue PAGO", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 1000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-05-10",
            receiptValue: 1000,
            interestValue: 47.5,
            discountValue: 0,
            netReceiptValue: 1047.5,
            receiptType: "Recebimento",
          },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.receiptValue).toBeCloseTo(1047.5)
    expect(inst.receiptValue!).toBeGreaterThan(inst.originalValue)
    expect(inst.status).toBe("PAGO")
    // O status vem do saldo devedor, não do valor pago.
    expect(getOpenBalance(inst)).toBe(0)
  })

  it("parcela paga com desconto: pago fica ABAIXO do valor da parcela e continua PAGO", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 1000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-05-10",
            receiptValue: 1000,
            interestValue: 0,
            discountValue: 120,
            netReceiptValue: 880,
            receiptType: "Recebimento",
          },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.receiptValue).toBeCloseTo(880)
    expect(inst.receiptValue!).toBeLessThan(inst.originalValue)
    expect(inst.status).toBe("PAGO")
    expect(getOpenBalance(inst)).toBe(0)
  })

  it("juros e desconto na mesma baixa: usa o líquido do Sienge, não recalcula a fórmula", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 2000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-06-02",
            receiptValue: 2000,
            interestValue: 63.21,
            discountValue: 15.4,
            netReceiptValue: 2047.81,
            receiptType: "Recebimento",
          },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.receiptValue).toBeCloseTo(2047.81)
  })

  it("várias baixas na mesma parcela somam os líquidos, não os nominais", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 5000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-04-05",
            receiptValue: 2000,
            interestValue: 30,
            netReceiptValue: 2030,
            receiptType: "Recebimento",
          },
          {
            receiptDate: "2026-05-05",
            receiptValue: 3000,
            discountValue: 50,
            netReceiptValue: 2950,
            receiptType: "Recebimento",
          },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    // Nominal somaria 5.000,00; líquido soma 4.980,00.
    expect(inst.receiptValue).toBeCloseTo(4980)
  })

  it("baixa sem netReceiptValue cai para receiptValue (fallback defensivo)", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 1000,
        currentBalance: 0,
        receipts: [
          { receiptDate: "2026-05-10", receiptValue: 1000, receiptType: "Recebimento" },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.receiptValue).toBe(1000)
  })

  it("netReceiptValue em baixa que NÃO é pagamento continua ignorado (allowlist da 75-369 intacta)", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 1000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-05-10",
            receiptValue: 1000,
            interestValue: 200,
            netReceiptValue: 1200,
            receiptType: "Distrato",
          },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.receiptValue).toBeUndefined()
    expect(inst.nonCashReceipts).toHaveLength(1)
    expect(inst.status).toBe("RENEGOCIADA")
    expect(getOpenBalance(inst)).toBe(0)
  })

  it("parcela com baixa parcial em atraso: PARCIAL, líquido somado, saldo devedor intacto", async () => {
    mockStatementResponse([
      makeInstallment({
        originalValue: 10000,
        currentBalance: 8000,
        receipts: [
          {
            receiptDate: "2026-05-10",
            receiptValue: 2000,
            interestValue: 18.33,
            netReceiptValue: 2018.33,
            receiptType: "Recebimento",
          },
        ],
      }),
    ])
    const [inst = null!] = await getFinancialStatement(1469)
    expect(inst.status).toBe("PARCIAL")
    expect(inst.receiptValue).toBeCloseTo(2018.33)
    expect(getOpenBalance(inst)).toBe(8000)
  })
})

describe("getCashReceiptValue — a regra do Recto líquido num só lugar", () => {
  it("usa netReceiptValue quando presente", () => {
    expect(
      getCashReceiptValue({ receiptDate: "2026-01-01", receiptValue: 100, netReceiptValue: 137.4 })
    ).toBe(137.4)
  })

  it("cai para receiptValue quando netReceiptValue está ausente", () => {
    expect(getCashReceiptValue({ receiptDate: "2026-01-01", receiptValue: 100 })).toBe(100)
  })

  it("respeita netReceiptValue zero — desconto integral não vira o nominal", () => {
    expect(
      getCashReceiptValue({ receiptDate: "2026-01-01", receiptValue: 100, netReceiptValue: 0 })
    ).toBe(0)
  })
})

/**
 * Story 75-370 / achado C1 do gate — a soma dos meses tem que fechar com o
 * acumulado. O breakdown mensal somava o valor nominal enquanto o acumulado já
 * vinha líquido, então bastavam juros numa baixa para os dois discordarem.
 */
describe("computeInformeFromStatements — mensal e acumulado no mesmo critério", () => {
  beforeEach(() => {
    vi.stubEnv("SIENGE_SUBDOMAIN", "trifold")
    vi.stubEnv("SIENGE_USERNAME", "user")
    vi.stubEnv("SIENGE_PASSWORD", "pass")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("baixas com juros e desconto: soma dos meses == acumulado, ambos líquidos", async () => {
    mockStatementResponse([
      makeInstallment({
        installmentId: 1,
        installmentNumber: "1",
        originalValue: 1000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-03-10",
            receiptValue: 1000,
            interestValue: 25,
            netReceiptValue: 1025,
            receiptType: "Recebimento",
          },
        ],
      }),
      makeInstallment({
        installmentId: 2,
        installmentNumber: "2",
        originalValue: 1000,
        currentBalance: 0,
        receipts: [
          {
            receiptDate: "2026-04-10",
            receiptValue: 1000,
            discountValue: 40,
            netReceiptValue: 960,
            receiptType: "Recebimento",
          },
        ],
      }),
    ])
    const installments = await getFinancialStatement(1469)
    const informe = computeInformeFromStatements(installments, 2026)

    expect(informe.totalPaidInYear).toBeCloseTo(1985) // 1.025 + 960, não 2.000
    expect(informe.accumulatedPaid).toBeCloseTo(informe.totalPaidInYear)
    const somaDosMeses = informe.monthlyBreakdown.reduce((s, m) => s + m.value, 0)
    expect(somaDosMeses).toBeCloseTo(informe.accumulatedPaid)
    // E cada lançamento do mês também no líquido.
    expect(informe.monthlyBreakdown[0]?.installments[0]?.value).toBeCloseTo(1025)
  })
})
