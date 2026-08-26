/**
 * Regras puras sobre parcelas do Sienge.
 *
 * Fica separado de `client.ts` de propósito: o client carrega credenciais e faz
 * fetch, e estas funções precisam rodar também em Client Components (extrato do
 * portal). Sem dependência de `process.env` ou de rede.
 */
import type { FormattedInstallment, SiengeReceipt } from "./types"

/**
 * Tipos de baixa que NÃO representam dinheiro recebido do cliente.
 *
 * Quando um contrato é renegociado, o Sienge não apaga as parcelas antigas: ele
 * as baixa com `receiptType: "Reparcelamento"` (saldo vai a zero) e gera novas
 * parcelas com o saldo devedor. Tratar essas baixas como pagamento faz o total
 * pago contar a mesma dívida duas vezes — a antiga "paga" e a nova em aberto.
 *
 * Caso real (contrato YAR-1301): 75 baixas de Reparcelamento somavam
 * R$ 423.317,28, e o portal exibia R$ 539.104,22 de total pago contra os
 * R$ 115.786,94 do extrato oficial do Sienge — exatamente essa diferença.
 */
export const NON_CASH_RECEIPT_TYPES = ["reparcelamento"]

/** Tipos de baixa já classificados — usado só para auditoria/diagnóstico. */
export const KNOWN_RECEIPT_TYPES = ["recebimento", ...NON_CASH_RECEIPT_TYPES]

/** Minúsculas e sem acento, para não depender da grafia exata da API. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

/**
 * `true` quando a baixa é entrada de caixa (pagamento real do cliente).
 *
 * Default deliberadamente permissivo: tipo desconhecido conta como pagamento,
 * preservando o comportamento histórico em vez de sumir com valor legítimo do
 * extrato. Tipos novos que não sejam caixa precisam entrar em
 * NON_CASH_RECEIPT_TYPES — `collectUnknownReceiptTypes()` ajuda a descobri-los.
 */
export function isCashReceipt(receipt: SiengeReceipt): boolean {
  const type = receipt.receiptType
  if (!type) return true
  return !NON_CASH_RECEIPT_TYPES.includes(normalize(type))
}

/**
 * Lista os `receiptType` presentes no extrato que ainda não foram classificados.
 * Serve para auditar a base e decidir se algum novo tipo deve deixar de contar
 * como pagamento. Não afeta nenhum cálculo.
 */
export function collectUnknownReceiptTypes(
  installments: FormattedInstallment[]
): string[] {
  const unknown = new Set<string>()
  for (const inst of installments) {
    for (const receipt of [...inst.receipts, ...inst.nonCashReceipts]) {
      const type = receipt.receiptType
      if (type && !KNOWN_RECEIPT_TYPES.includes(normalize(type))) {
        unknown.add(type)
      }
    }
  }
  return [...unknown]
}

/**
 * Quanto a parcela ainda representa de dívida.
 *
 * Fonte única da regra: parcela quitada e parcela renegociada valem 0. A
 * renegociada é o caso perigoso — tem `currentBalance` zerado, então qualquer
 * cálculo do tipo `currentBalance > 0 ? currentBalance : originalValue` cairia
 * no `originalValue` e ressuscitaria uma dívida que já foi transferida para as
 * parcelas novas.
 */
export function getOpenBalance(inst: FormattedInstallment): number {
  if (inst.status === "PAGO" || inst.status === "RENEGOCIADA") return 0
  return inst.currentBalance > 0 ? inst.currentBalance : inst.originalValue
}
