/**
 * Kanban stage UUIDs — single source of truth.
 * Used by: pipeline.ts, feedback route, followup cron.
 */
export const STAGE_IDS = {
  novo:           "00000000-0000-0000-0001-000000000001",
  em_qualificacao:"00000000-0000-0000-0001-000000000002",
  qualificado:    "00000000-0000-0000-0001-000000000003",
  visita_agendada:"00000000-0000-0000-0001-000000000004",
  no_show:        "00000000-0000-0000-0001-000000000009",
  visitou:        "00000000-0000-0000-0001-000000000005",
  proposta:       "9d3ddf3c-8049-4dd8-9e8b-81bba99ee529", // Supremo id_situacao=10261
  negociando:     "00000000-0000-0000-0001-000000000006",
  fechou:         "00000000-0000-0000-0001-000000000007",
  represamento:   "00000000-0000-0000-0001-000000000010", // Supremo id_situacao=10688
  perdido:        "00000000-0000-0000-0001-000000000008",
  acao_muffato:   "dab590c7-ffc5-4086-be9a-4914f94fa3ba", // coluna exclusiva trifold
  importar_crm:   "dfc0f7d1-4484-4cc2-917c-4ac15a561e42", // entrada leads Supremo CRM
} as const

export type StageSlug = keyof typeof STAGE_IDS
