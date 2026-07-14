// Story 78-14 — Função pura de agregação "Total Assinaturas Fixas" (AC6).
//
// Sem I/O — testável isoladamente (subscription-summary.test.ts), mesmo padrão de
// cost-summary.ts (78-12) / reminder-schedule.ts (78-11) / collection-health.ts (78-13).
//
// Regra de moeda (NFR-7): NUNCA soma USD com BRL — a agregação é sempre por moeda.
//
// Esta função é consumida pela Story 78-15 (UI). Esta story só garante que o dado e a função
// existem e estão corretos; o wire-up em GET /api/admin/billing-panel é decisão da 78-15.

/** Linha mínima consumida da query de service_billing_reminders. */
export type SubscriptionSummaryRow = {
  is_fixed_subscription: boolean
  excluded_from_subscription_total: boolean
  expected_amount: number | string | null
  currency: string
}

/**
 * Total "Assinaturas Fixas" por moeda. Soma `expected_amount` agrupado por `currency`,
 * considerando SOMENTE linhas com:
 *   - is_fixed_subscription = true            (é uma assinatura fixa, não vencimento avulso);
 *   - excluded_from_subscription_total = false (não está embutida em outro total — anti-dupla
 *                                               contagem, hoje só a Vercel fica de fora, AC10);
 *   - expected_amount != null                 (valor já cadastrado/enriquecido).
 * Nunca mistura moedas diferentes na mesma chave (NFR-7).
 */
export function somarAssinaturasFixasPorMoeda(
  rows: SubscriptionSummaryRow[]
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.is_fixed_subscription) continue
    if (r.excluded_from_subscription_total) continue
    if (r.expected_amount == null) continue
    const amount = Number(r.expected_amount)
    if (!Number.isFinite(amount)) continue
    out.set(r.currency, (out.get(r.currency) ?? 0) + amount)
  }
  return out
}
