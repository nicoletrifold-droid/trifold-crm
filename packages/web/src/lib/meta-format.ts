/**
 * Formatadores compartilhados para UI de Meta Ads.
 *
 * Extraído de `dashboard/campaigns/meta/campaigns-meta-client.tsx` (Story 16.8)
 * para reuso em `[campaign_id]/campaign-detail-client.tsx` (Story 16.9).
 */

export const formatBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)

export const formatBudget = (
  daily: number | null,
  lifetime: number | null,
): string => {
  if (daily) return `${formatBRL(daily / 100)}/dia`
  if (lifetime) return `${formatBRL(lifetime / 100)} total`
  return "—"
}

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("pt-BR").format(n)

export const formatPercent = (n: number): string =>
  `${n.toFixed(2).replace(".", ",")}%`

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

/** Formata "YYYY-MM-DD" em "DD/MM" sem criar objeto Date (evita TZ shifts). */
export const formatDayMonth = (yyyymmdd: string): string => {
  const parts = yyyymmdd.split("-")
  if (parts.length !== 3) return yyyymmdd
  const [, month, day] = parts
  return `${day}/${month}`
}

/** Formata um ISO datetime range "Início — Fim" ou "Em andamento". */
export const formatPeriod = (
  startTime: string | null,
  stopTime: string | null,
): string => {
  if (!startTime && !stopTime) return "—"
  const start = startTime ? formatDate(startTime) : "—"
  const end = stopTime ? formatDate(stopTime) : "Em andamento"
  return `${start} — ${end}`
}

/** Formata centavos em "R$ X/dia" ou "R$ X total" — variant compacta para header. */
export const formatBudgetCompact = (
  daily: number | null,
  lifetime: number | null,
): string => formatBudget(daily, lifetime)
