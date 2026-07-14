// Story 78-14 — Tipos do módulo de enriquecimento de ASSINATURAS FIXAS.
//
// DECISÃO DE DESIGN (IDS CREATE, não ADAPT — ver Dev Notes da Story 78-14): este módulo NÃO
// reusa o contrato `BillingCollector`/`CostSnapshotRow` da Story 78-3. Aquele contrato popula
// service_cost_snapshots (série temporal diária, upsert por (service_id, snapshot_date, metric)).
// Aqui o alvo é fundamentalmente diferente: uma ATUALIZAÇÃO DE ESTADO ATUAL (quantos assentos
// existem HOJE, qual plano está ativo AGORA) sobre a linha ÚNICA e já existente
// (service_billing_reminders com is_fixed_subscription=true) — sem conceito de "dia" nem série
// temporal, e com uma regra de não-sobrescrita de edição manual (AC9) que runCollector() não tem.

/** Estado atual (parcial) da linha de assinatura fixa, lido antes de decidir o que atualizar. */
export interface CurrentSubscriptionRow {
  id: string
  service_id: string
  value_source: string | null
  seats_source: string | null
}

/**
 * Conjunto de campos que o enriquecedor DEVE gravar. Só inclui campos que passaram pelas
 * regras de não-sobrescrita (AC9). `last_enriched_at` é sempre incluído (observabilidade).
 */
export interface SubscriptionUpdate {
  subscription_plan?: string
  subscription_seats?: number
  expected_amount?: number
  value_source?: "api_price_table"
  seats_source?: "api"
  last_enriched_at: string
}

/** Resultado de um enriquecedor por serviço — best-effort, consumido pelo cron (AC11). */
export type EnrichmentResult =
  | {
      serviceSlug: string
      status: "ok"
      update: SubscriptionUpdate
      plan?: string | null
      seats?: number | null
    }
  | { serviceSlug: string; status: "skipped"; reason: string }
  | { serviceSlug: string; status: "error"; error: string }
