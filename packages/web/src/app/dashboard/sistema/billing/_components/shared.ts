// Story 78-9 — tipos e helpers compartilhados do Painel de Saúde & Billing.

export type CollectionStatus = "ok" | "manual" | "no_data" | "error"

export interface MoneyByCurrency {
  currency: string
  amount: number
}

export interface ServiceSummary {
  slug: string
  name: string
  category: string
  automation_tier: string
  billing_url: string
  billing_url_confirmed: boolean
  display_order: number
  collection_status: CollectionStatus
  last_collected_at: string | null
  month_costs: MoneyByCurrency[]
}

export interface BillingPanelData {
  services: ServiceSummary[]
  meta_ads: ServiceSummary | null
  consolidated_total: MoneyByCurrency[]
  generated_at: string
}

// Fontes dos campos de assinatura fixa (Story 78-14 AC13). `null` = ainda não informado.
export type ValueSource = "api_price_table" | "manual" | null
export type SeatsSource = "api" | "manual" | null

// Contrato de GET /api/admin/billing-reminders (Story 78-8): { data: [...] } com
// platform_services(slug, name, category) aninhado (objeto ou array, dependendo do driver).
//
// Story 78-15 (T2.1): `due_date` passa a ser nullable (78-14 AC1 relaxa a coluna) e os 7 campos
// de assinatura fixa são adicionados como OPCIONAIS — assim um payload antigo (pré-78-14, sem
// essas chaves) continua a tipar/renderizar sem crash (AC9): `undefined` é tratado como
// equivalente a `null`/`false` em todos os consumidores.
export interface ReminderRow {
  id: string
  service_id: string
  due_date: string | null
  expected_amount: number | string | null
  currency: string
  billing_cycle: string
  alert_days_before: number
  status: string
  paid_at: string | null
  notes: string | null
  is_fixed_subscription?: boolean
  subscription_plan?: string | null
  subscription_seats?: number | null
  value_source?: ValueSource
  seats_source?: SeatsSource
  excluded_from_subscription_total?: boolean
  last_enriched_at?: string | null
  platform_services:
    | { slug: string; name: string; category: string }
    | { slug: string; name: string; category: string }[]
    | null
}

const CURRENCY_SYMBOL: Record<string, string> = {
  BRL: "R$",
  USD: "US$",
}

/** Formata um valor na moeda de origem — NUNCA converte (NFR-7 do épico). */
export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  const num = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${symbol} ${num}`
}

/**
 * Formata uma lista de valores por moeda para exibição.
 * Moedas diferentes são exibidas separadamente (AC7) — nunca somadas.
 */
export function formatMoneyList(list: MoneyByCurrency[]): string {
  if (list.length === 0) return "—"
  return list.map((m) => formatMoney(m.amount, m.currency)).join(" · ")
}

/** Tempo relativo simples em pt-BR (não há helper no projeto — inline por T4.3). */
export function relativeTime(iso: string | null): string {
  if (!iso) return "nunca coletado"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "nunca coletado"
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "agora mesmo"
  if (min < 60) return `há ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days} ${days === 1 ? "dia" : "dias"}`
}

export interface StatusStyle {
  badge: string
  dot: string
  label: string
}

/** Mapeamento de collection_status → estilo do badge (Dev Notes 78-9). */
export const STATUS_STYLES: Record<CollectionStatus, StatusStyle> = {
  ok: {
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    dot: "bg-emerald-500",
    label: "Coleta OK",
  },
  manual: {
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    dot: "bg-blue-500",
    label: "Manual",
  },
  no_data: {
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    dot: "bg-amber-500",
    label: "Sem dado",
  },
  error: {
    badge: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    dot: "bg-red-500",
    label: "Erro na coleta",
  },
}

/** Data de "hoje" (YYYY-MM-DD) em America/Sao_Paulo — para diferença de dias de vencimento. */
export function todaySaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

/** Dias até o vencimento (negativo = vencido). Datas puras (sem hora), sem erro de borda. */
export function daysUntil(dueDate: string): number {
  const today = todaySaoPaulo()
  const dueMs = Date.parse(`${dueDate}T00:00:00`)
  const todayMs = Date.parse(`${today}T00:00:00`)
  if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) return Number.POSITIVE_INFINITY
  return Math.round((dueMs - todayMs) / 86400000)
}

/** Normaliza o join platform_services (objeto ou array) para um único registro. */
export function firstService(
  ps: ReminderRow["platform_services"]
): { slug: string; name: string; category: string } | null {
  if (!ps) return null
  return Array.isArray(ps) ? ps[0] ?? null : ps
}
