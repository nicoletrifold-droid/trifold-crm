import "server-only"

import { getFinancialStatement } from "@web/lib/integrations/sienge/client"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"

// Story 78-1 — extrato financeiro (Sienge) do cliente escolhido no viewer. Recebe o
// sienge_customer_id + contract numbers já resolvidos pelo vínculo (getViewerVinculo).
// Somente leitura; nada é persistido.

export interface ObraFinancialResult {
  configured: boolean
  unavailable: boolean
  installments: FormattedInstallment[]
}

export async function getVinculoFinancialStatement(
  siengeCustomerId: number | null,
  contractNumbers: string[]
): Promise<ObraFinancialResult> {
  if (!siengeCustomerId) {
    return { configured: false, unavailable: false, installments: [] }
  }
  try {
    let installments = await getFinancialStatement(siengeCustomerId)
    if (contractNumbers.length > 0) {
      installments = installments.filter((i) => contractNumbers.includes(i.documentId))
    }
    return { configured: true, unavailable: false, installments }
  } catch {
    return { configured: true, unavailable: true, installments: [] }
  }
}
