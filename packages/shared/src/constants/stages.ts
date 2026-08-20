/**
 * Kanban stage UUIDs — single source of truth.
 * Used by: pipeline.ts, feedback route, followup cron.
 *
 * 🔥 Story 75-358 — chave aqui é NOME DE CÓDIGO, não o nome que aparece no board.
 * Os dois divergem: a `…0009` nasceu "No-Show" (mig 011) e foi renomeada para
 * "Atendimento" na tela Configurações → Pipeline em 08/06/2026. A constante
 * continuou chamada `no_show` por 73 dias, e `pipeline.ts` acusava de furar visita
 * TODO lead em Atendimento — 4 de 4 leads que responderam ao cron de 20/08, os
 * quatro sem uma única linha em `appointments`. Renomear etapa na UI é barato;
 * renomear uma chave daqui exige varredura. Ao mexer numa, conferir a outra.
 */
export const STAGE_IDS = {
  novo:           "00000000-0000-0000-0001-000000000001",
  em_qualificacao:"00000000-0000-0000-0001-000000000002",
  qualificado:    "00000000-0000-0000-0001-000000000003",
  visita_agendada:"00000000-0000-0000-0001-000000000004",
  // "Atendimento" no board (129 leads em 20/08). Era o antigo `no_show` — quem
  // quer dizer Atendimento usa esta chave, e o `supremo-sync` é o caso principal.
  atendimento:    "00000000-0000-0000-0001-000000000009",
  // Etapa No-Show de verdade, criada pela mig 236 entre Visita Agendada e Visitou.
  no_show:        "00000000-0000-0000-0001-000000000011",
  visitou:        "00000000-0000-0000-0001-000000000005",
  proposta:       "9d3ddf3c-8049-4dd8-9e8b-81bba99ee529", // Supremo id_situacao=10261
  negociando:     "00000000-0000-0000-0001-000000000006",
  fechou:         "00000000-0000-0000-0001-000000000007",
  represamento:   "00000000-0000-0000-0001-000000000010", // Supremo id_situacao=10688
  perdido:        "00000000-0000-0000-0001-000000000008",
  nao_qualificado:"95327bd7-3e88-4038-aa16-250a74ab085c",
  acao_muffato:   "dab590c7-ffc5-4086-be9a-4914f94fa3ba", // coluna exclusiva trifold
  importar_crm:   "dfc0f7d1-4484-4cc2-917c-4ac15a561e42", // entrada leads Supremo CRM
} as const

export type StageSlug = keyof typeof STAGE_IDS

/**
 * Etapas que significam "fora do funil por perda". "Perdido" é ETAPA, não
 * `lost_reason` (convenção 75-153) — e "Não Qualificado" conta igual.
 *
 * Story 75-340: os dois UUIDs viviam copiados em `web/lib/leads/stage-filters`,
 * em duas rotas e num componente. O pacote `ai` precisava da mesma lista para
 * marcar reativação, então a fonte passou a ser aqui.
 */
export const PERDIDO_STAGE_IDS: string[] = [STAGE_IDS.perdido, STAGE_IDS.nao_qualificado]
