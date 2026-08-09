/**
 * Fonte única dos status de empreendimento.
 *
 * Espelha o enum `property_status` do Postgres (migration `002_property_schema.sql`).
 * Qualquer valor fora desta lista é recusado pelo banco — validar antes evita
 * um 500 opaco vindo do Postgres.
 */
export const PROPERTY_STATUSES = [
  "planning",
  "launching",
  "selling",
  "delivered",
  "sold_out",
] as const

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number]

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  planning: "Planejamento",
  launching: "Lançamento",
  selling: "Em venda",
  delivered: "Entregue",
  sold_out: "Esgotado",
}

/**
 * Story 75-283 — rótulo para EXIBIR, com fallback seguro.
 *
 * As telas faziam `status === "selling" ? "Em venda" : status === "launching" ? … : status`, cobrindo
 * 2 dos 5 valores do enum. O `: status` final imprimia o valor cru do Postgres — foi assim que
 * "planning" apareceu em inglês na lista de Empreendimentos quando Solun e Japura foram criados.
 * Valor desconhecido continua sendo exibido cru (melhor que vazio), mas os 5 do enum têm rótulo.
 */
export function propertyStatusLabel(status: string | null | undefined): string {
  if (!status) return "—"
  return PROPERTY_STATUS_LABELS[status as PropertyStatus] ?? status
}

/**
 * Story 75-283 — classes do badge de status, antes duplicadas em 6 telas (dashboard, detalhe,
 * lista, e os 3 equivalentes do /broker). Mantém a paleta que já estava em produção: `selling`
 * verde, `launching` azul, os demais cinza.
 */
export const PROPERTY_STATUS_BADGE: Record<PropertyStatus, string> = {
  planning:
    "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
  launching:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  selling:
    "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  delivered:
    "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
  sold_out:
    "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
}

const PROPERTY_STATUS_BADGE_FALLBACK =
  "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"

export function propertyStatusBadge(status: string | null | undefined): string {
  return (
    PROPERTY_STATUS_BADGE[status as PropertyStatus] ??
    PROPERTY_STATUS_BADGE_FALLBACK
  )
}

/** Opções prontas para `<select>`, na ordem do enum. */
export const PROPERTY_STATUS_OPTIONS = PROPERTY_STATUSES.map((value) => ({
  value,
  label: PROPERTY_STATUS_LABELS[value],
}))

export function isPropertyStatus(value: unknown): value is PropertyStatus {
  return (
    typeof value === "string" &&
    (PROPERTY_STATUSES as readonly string[]).includes(value)
  )
}
