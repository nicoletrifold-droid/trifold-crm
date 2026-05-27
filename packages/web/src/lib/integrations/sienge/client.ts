import type {
  SiengeCustomer,
  SiengeCustomersResponse,
  SiengeFinancialStatementsResponse,
  SiengePaymentSlipResponse,
  FormattedInstallment,
  InstallmentStatus,
  SiengeEnterprise,
  SiengeEnterprisesResponse,
  SiengeUnitsResponse,
  SiengeContract,
  SiengeContractsResponse,
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

// ── Enterprise / Unit / Contract endpoints ──────────────────────────

const PAGE_SIZE = 200
const PAGE_DELAY_MS = 300

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Lista todos os empreendimentos do Sienge (paginação automática).
 */
export async function getEnterprises(): Promise<SiengeEnterprise[]> {
  const all: SiengeEnterprise[] = []
  let offset = 0

  while (true) {
    const data = await siengeRequest<SiengeEnterprisesResponse>(
      `/enterprises?limit=${PAGE_SIZE}&offset=${offset}`
    )
    all.push(...data.results)

    const total = data.resultSetMetadata.count
    offset += PAGE_SIZE

    if (offset >= total) break
    await sleep(PAGE_DELAY_MS)
  }

  return all
}

/**
 * Retorna o conjunto de unit IDs de um empreendimento (paginação automática).
 */
export async function getUnitIdsByEnterprise(
  enterpriseId: number
): Promise<Set<number>> {
  const ids = new Set<number>()
  let offset = 0

  while (true) {
    const data = await siengeRequest<SiengeUnitsResponse>(
      `/units?enterpriseId=${enterpriseId}&limit=${PAGE_SIZE}&offset=${offset}`
    )

    for (const u of data.results) {
      ids.add(u.id)
    }

    const total = data.resultSetMetadata.count
    offset += PAGE_SIZE

    if (offset >= total) break
    await sleep(PAGE_DELAY_MS)
  }

  return ids
}

/**
 * Lista contratos de venda. Filtra por enterpriseId na API quando fornecido.
 */
export async function getAllSalesContracts(
  enterpriseId?: number
): Promise<SiengeContract[]> {
  const all: SiengeContract[] = []
  let offset = 0
  const filter = enterpriseId ? `&enterpriseId=${enterpriseId}` : ""

  while (true) {
    const data = await siengeRequest<SiengeContractsResponse>(
      `/sales-contracts?limit=${PAGE_SIZE}&offset=${offset}${filter}`
    )
    all.push(...data.results)

    const total = data.resultSetMetadata.count
    offset += PAGE_SIZE

    if (offset >= total) break
    await sleep(PAGE_DELAY_MS)
  }

  return all
}

/**
 * Busca detalhe de um cliente pelo ID Sienge. Retorna null se 404.
 */
export async function getCustomerById(
  id: number
): Promise<SiengeCustomer | null> {
  try {
    return await siengeRequest<SiengeCustomer>(`/customers/${id}`)
  } catch (err) {
    if (err instanceof Error && err.message.includes("HTTP 404")) {
      return null
    }
    throw err
  }
}
