export interface SiengeCustomer {
  id: number
  name: string
  cpf: string | null
  email: string | null
  phone: string | null
}

export interface SiengeCustomersResponse {
  resultSetMetadata: {
    count: number
    offset: number
    limit: number
  }
  results: SiengeCustomer[]
}

export interface SiengeReceipt {
  receiptDate: string
  receiptValue: number
}

export interface SiengeInstallment {
  installmentId: number
  installmentNumber: string
  dueDate: string
  conditionType: "AT" | "PI" | "PM" | "CH"
  originalValue: number
  currentBalance: number
  generatedBillet: boolean
  receipts: SiengeReceipt[]
}

export interface SiengeBillReceivable {
  billReceivableId: number
  documentId: string
  finePercent: number
  interestPercent: number
  installments: SiengeInstallment[]
}

export interface SiengeFinancialStatement {
  billsReceivable: SiengeBillReceivable[]
}

export interface SiengeFinancialStatementsResponse {
  results: SiengeFinancialStatement[]
}

export interface SiengePaymentSlipResponse {
  url?: string
  [key: string]: unknown
}

export type InstallmentStatus = "PAGO" | "BOLETO_GERADO" | "EM_ABERTO"

export interface FormattedInstallment {
  billReceivableId: number
  documentId: string
  installmentId: number
  installmentNumber: string
  dueDate: string
  conditionType: "AT" | "PI" | "PM" | "CH"
  originalValue: number
  currentBalance: number
  generatedBillet: boolean
  status: InstallmentStatus
  hasBoleto: boolean
}

// ── Enterprise / Unit / Contract (sync de Obras ↔ Empreendimentos) ───

export interface SiengeEnterprise {
  id: number
  name: string
  address: string | null
  city: string | null
  totalUnits: number
  availableUnits: number
}

export interface SiengeEnterprisesResponse {
  resultSetMetadata: {
    count: number
    offset: number
    limit: number
  }
  results: SiengeEnterprise[]
}

export interface SiengeUnit {
  id: number
  enterpriseId: number
  block: string | null
  floor: number | null
  number: string | null
  status: string
}

export interface SiengeUnitsResponse {
  resultSetMetadata: {
    count: number
    offset: number
    limit: number
  }
  results: SiengeUnit[]
}

export interface SiengeContract {
  id: number
  contractNumber: string
  customerId: number
  unitId: number
  status: string
  totalValue: number
  signatureDate: string | null
}

export interface SiengeContractsResponse {
  resultSetMetadata: {
    count: number
    offset: number
    limit: number
  }
  results: SiengeContract[]
}
