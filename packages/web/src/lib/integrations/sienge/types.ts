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
  commercialName: string | null
  cnpj: string
  companyId: number
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
  name: string | null
  propertyType: string | null
  floor: string | null
  commercialStock: string | null
}

export interface SiengeUnitsResponse {
  resultSetMetadata: {
    count: number
    offset: number
    limit: number
  }
  results: SiengeUnit[]
}

export interface SiengeContractCustomer {
  id: number
  name: string
  main: boolean
  spouse: boolean
}

export interface SiengeContract {
  id: number
  enterpriseId: number
  enterpriseName: string
  number: string
  situation: string
  value: number
  contractDate: string | null
  salesContractCustomers: SiengeContractCustomer[]
}

export interface SiengeContractsResponse {
  resultSetMetadata: {
    count: number
    offset: number
    limit: number
  }
  results: SiengeContract[]
}
