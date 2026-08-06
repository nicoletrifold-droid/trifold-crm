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
