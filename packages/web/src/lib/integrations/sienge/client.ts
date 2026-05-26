import type {
  SiengeCustomer,
  SiengeCustomersResponse,
  SiengeFinancialStatementsResponse,
  SiengePaymentSlipResponse,
  FormattedInstallment,
  InstallmentStatus,
} from "./types"

function getBaseUrl(): string {
  const subdomain = process.env.SIENGE_SUBDOMAIN
  if (!subdomain) throw new Error("SIENGE_SUBDOMAIN env var não configurada")
  return `https://api.sienge.com.br/${subdomain}/public/api/v1`
}

function getAuthHeader(): string {
  const username = process.env.SIENGE_USERNAME
  const password = process.env.SIENGE_PASSWORD
  if (!username || !password) {
    throw new Error("SIENGE_USERNAME ou SIENGE_PASSWORD env vars não configuradas")
  }
  const encoded = Buffer.from(`${username}:${password}`).toString("base64")
  return `Basic ${encoded}`
}

async function siengeRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getBaseUrl()
  const authHeader = getAuthHeader()

  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      // Backoff exponencial: 1s, 2s
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.headers ?? {}),
        },
      })

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Sienge HTTP ${res.status}`)
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`Sienge HTTP ${res.status}: ${body}`)
      }

      return res.json() as Promise<T>
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Sienge HTTP")) {
        lastError = err
        continue
      }
      throw err
    }
  }

  throw lastError ?? new Error("Sienge request falhou após 3 tentativas")
}

export async function searchCustomerByCpf(
  cpf: string
): Promise<SiengeCustomer | null> {
  const sanitized = cpf.replace(/\D/g, "")
  const pageSize = 200
  let offset = 0

  while (true) {
    const data = await siengeRequest<SiengeCustomersResponse>(
      `/customers?limit=${pageSize}&offset=${offset}`
    )

    const found = data.results.find(
      (c) => c.cpf?.replace(/\D/g, "") === sanitized
    )
    if (found) return found

    const total = data.resultSetMetadata.count
    offset += pageSize

    if (offset >= total) break

    // Respeita rate limit de 200 req/min — pausa entre páginas
    await new Promise((r) => setTimeout(r, 300))
  }

  return null
}

export async function getFinancialStatement(
  customerId: number
): Promise<FormattedInstallment[]> {
  const data = await siengeRequest<SiengeFinancialStatementsResponse>(
    `/customer-financial-statements?customerId=${customerId}`
  )

  const installments: FormattedInstallment[] = []

  for (const statement of data.results) {
    for (const bill of statement.billsReceivable) {
      for (const inst of bill.installments) {
        let status: InstallmentStatus
        if (inst.receipts.length > 0) {
          status = "PAGO"
        } else if (inst.generatedBillet) {
          status = "BOLETO_GERADO"
        } else {
          status = "EM_ABERTO"
        }

        installments.push({
          billReceivableId: bill.billReceivableId,
          documentId: bill.documentId,
          installmentId: inst.installmentId,
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate,
          conditionType: inst.conditionType,
          originalValue: inst.originalValue,
          currentBalance: inst.currentBalance,
          generatedBillet: inst.generatedBillet,
          status,
          hasBoleto: inst.generatedBillet && inst.currentBalance > 0,
        })
      }
    }
  }

  return installments
}

export async function getPaymentSlip(
  billReceivableId: number,
  installmentId: number
): Promise<SiengePaymentSlipResponse> {
  return siengeRequest<SiengePaymentSlipResponse>(
    `/payment-slip-notification?billReceivableId=${billReceivableId}&installmentId=${installmentId}`
  )
}
