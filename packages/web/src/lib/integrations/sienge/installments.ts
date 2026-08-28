/**
 * Regras puras sobre parcelas do Sienge.
 *
 * Fica separado de `client.ts` de propósito: o client carrega credenciais e faz
 * fetch, e estas funções precisam rodar também em Client Components (extrato do
 * portal). Sem dependência de `process.env` ou de rede.
 */
import type { FormattedInstallment, SiengeReceipt } from "./types"

/**
 * Tipos de baixa que SÃO pagamento do cliente — allowlist fechada.
 *
 * Definição do financeiro (Robson, 28/08/2026), depois da varredura da base
 * completa (1.482 clientes, 1.112 com extrato): dos 11 tipos de baixa que o
 * Sienge registra, só estes dois representam baixa de parcela de contrato.
 *
 * - `recebimento`: dinheiro que entrou e quitou (total ou parcialmente) a parcela.
 * - `abatimento de adiantamento`: o crédito de um adiantamento anterior sendo
 *   usado para quitar a parcela. É AQUI que o adiantamento vira pagamento — por
 *   isso `adiantamento` fica de fora: contar os dois somaria o mesmo dinheiro
 *   duas vezes.
 */
export const CASH_RECEIPT_TYPES = ["recebimento", "abatimento de adiantamento"]

/**
 * Tipos de baixa que NÃO representam dinheiro pago pelo cliente.
 *
 * Todos existem na base e todos eram contados como pagamento antes desta
 * correção — juntos, R$ 155,7 milhões a mais do que o extrato oficial do Sienge.
 * A lista não é usada para decidir (quem decide é a allowlist acima); serve para
 * saber que o tipo já foi classificado e para rotular a parcela na tela.
 */
export const NON_CASH_RECEIPT_TYPES = [
  // Renegociação: o Sienge baixa a parcela antiga (saldo vai a zero) e gera
  // parcelas novas com o saldo devedor. Caso que originou a investigação
  // (contrato YAR-1301): 75 baixas somando R$ 423.317,28 infladas no portal.
  "reparcelamento",
  "substituicao", // parcela trocada por outra; a dívida continua
  "cancelamento", // parcela cancelada
  "adiantamento", // crédito a usar — vira pagamento no "abatimento de adiantamento"
  "distrato", // contrato rescindido; as parcelas restantes são baixadas
  "outros", // baixa genérica; na base, quase toda com desconto integral
  "bonificacao", // desconto da construtora, não dinheiro do cliente
  "repactuacao", // ajuste que acompanha um recebimento, não um segundo pagamento
  "outros com residuo", // ajuste de centavos (R$ 9,87 em toda a base)
]

/** Tipos de baixa já classificados — usado só para auditoria/diagnóstico. */
export const KNOWN_RECEIPT_TYPES = [
  ...CASH_RECEIPT_TYPES,
  ...NON_CASH_RECEIPT_TYPES,
]

/** Minúsculas, sem acento e com espaços normalizados, para não depender da grafia exata da API. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

/**
 * `true` quando a baixa é pagamento do cliente.
 *
 * Default deliberadamente restritivo: tipo desconhecido NÃO conta. O default
 * antigo era o oposto — qualquer tipo fora da blacklist virava pagamento — e foi
 * exatamente assim que 9 tipos de baixa contábil entraram no "total pago" do
 * portal sem ninguém notar. Tipo novo que seja pagamento precisa entrar em
 * CASH_RECEIPT_TYPES; `collectUnknownReceiptTypes()` ajuda a descobri-los.
 *
 * Exceção: baixa sem `receiptType` continua contando. Não é tipo desconhecido —
 * é ausência de tipo, comportamento histórico da API, e não há o que julgar.
 */
export function isCashReceipt(receipt: SiengeReceipt): boolean {
  const type = receipt.receiptType
  if (!type) return true
  return CASH_RECEIPT_TYPES.includes(normalize(type))
}

/**
 * Rótulo para a parcela baixada sem pagamento, derivado do tipo real da baixa.
 *
 * Sem isso a tela chamaria de "Renegociada" um distrato, um cancelamento ou uma
 * substituição — todos caem no mesmo status interno (RENEGOCIADA = baixada sem
 * dinheiro), mas dizem coisas diferentes para o cliente.
 */
const NON_CASH_LABELS: Record<string, string> = {
  reparcelamento: "Renegociada",
  substituicao: "Substituída",
  cancelamento: "Cancelada",
  adiantamento: "Adiantamento",
  distrato: "Distratada",
  bonificacao: "Bonificada",
  repactuacao: "Repactuada",
}

export function getNonCashLabel(inst: FormattedInstallment): string {
  const type = inst.nonCashReceipts[inst.nonCashReceipts.length - 1]?.receiptType
  if (!type) return "Baixada"
  return NON_CASH_LABELS[normalize(type)] ?? "Baixada"
}

/**
 * Lista os `receiptType` presentes no extrato que ainda não foram classificados.
 * Serve para auditar a base e decidir se algum novo tipo deve passar a contar
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
 * Fonte única da regra: parcela quitada e parcela baixada sem pagamento
 * (RENEGOCIADA) valem 0. A segunda é o caso perigoso — tem `currentBalance`
 * zerado, então qualquer cálculo do tipo `currentBalance > 0 ? currentBalance :
 * originalValue` cairia no `originalValue` e ressuscitaria uma dívida que já foi
 * transferida, cancelada ou distratada.
 */
export function getOpenBalance(inst: FormattedInstallment): number {
  if (inst.status === "PAGO" || inst.status === "RENEGOCIADA") return 0
  return inst.currentBalance > 0 ? inst.currentBalance : inst.originalValue
}
