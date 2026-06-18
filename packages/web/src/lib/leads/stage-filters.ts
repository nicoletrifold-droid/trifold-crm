/**
 * Fonte única de verdade dos stages excluídos das visões de fluxo de leads.
 * Usado pelo card "Leads ativos" (dashboard) E pela lista "Em atendimento"
 * (leads/page) — garante que os dois números sempre batem.
 */

// Perdidos — aba "Perdidos" e exclusão da view ativos.
export const PERDIDO_STAGE_IDS = [
  "00000000-0000-0000-0001-000000000008", // Perdido
  "95327bd7-3e88-4038-aa16-250a74ab085c", // Não Qualificado
]

// Acervo/legado — fora do fluxo de atendimento (e não são "perdidos").
// Continuam visíveis no Pipeline kanban.
export const ACERVO_STAGE_IDS = [
  "62075f72-1629-4d8b-a019-0fcb35e3d302", // Corretores Antigos
  "00000000-0000-0000-0001-000000000010", // Represamento
]

// Stages ocultos na visão "Em atendimento" / contagem "Leads ativos".
export const EM_ATENDIMENTO_EXCLUDED_IDS = [...PERDIDO_STAGE_IDS, ...ACERVO_STAGE_IDS]
