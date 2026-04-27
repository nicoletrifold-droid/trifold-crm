/**
 * Constantes compartilhadas para UI de Meta Ads.
 *
 * Extraído de `dashboard/campaigns/meta/campaigns-meta-client.tsx` (Story 16.8)
 * para reuso em `[campaign_id]/campaign-detail-client.tsx` (Story 16.9).
 */

export const STATUS_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  ACTIVE: { label: "Ativa", className: "bg-green-100 text-green-700" },
  PAUSED: { label: "Pausada", className: "bg-yellow-100 text-yellow-700" },
  ARCHIVED: { label: "Arquivada", className: "bg-gray-100 text-gray-600" },
  DELETED: { label: "Deletada", className: "bg-red-100 text-red-700" },
}

export const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Geração de Leads",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_APP_PROMOTION: "Promoção de App",
  OUTCOME_SALES: "Vendas",
}

export const OPTIMIZATION_GOAL_LABELS: Record<string, string> = {
  LEAD_GENERATION: "Geração de Leads",
  CONVERSATIONS: "Conversas",
  LINK_CLICKS: "Cliques no Link",
  LANDING_PAGE_VIEWS: "Visualizações de Página",
  IMPRESSIONS: "Impressões",
  REACH: "Alcance",
  ENGAGED_USERS: "Usuários Engajados",
  PAGE_LIKES: "Curtidas na Página",
  OFFSITE_CONVERSIONS: "Conversões Externas",
  APP_INSTALLS: "Instalações de App",
  REPLIES: "Respostas",
}

/**
 * Badges para status derivados do funil CRM (kanban_stages.type +
 * qualification_status). Usado na coluna "Status" de leads associados.
 */
export const LEAD_STATUS_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  // stage_type
  novo: { label: "Novo", className: "bg-blue-100 text-blue-700" },
  qualificado: { label: "Qualificado", className: "bg-indigo-100 text-indigo-700" },
  agendado: { label: "Agendado", className: "bg-purple-100 text-purple-700" },
  visitou: { label: "Visitou", className: "bg-teal-100 text-teal-700" },
  proposta: { label: "Proposta", className: "bg-amber-100 text-amber-700" },
  fechado: { label: "Fechado", className: "bg-green-100 text-green-700" },
  perdido: { label: "Perdido", className: "bg-red-100 text-red-700" },
  no_show: { label: "No-Show", className: "bg-gray-200 text-gray-700" },
  // qualification_status fallback
  not_started: { label: "Não iniciado", className: "bg-gray-100 text-gray-600" },
  in_progress: { label: "Em qualificação", className: "bg-yellow-100 text-yellow-700" },
  qualified: { label: "Qualificado", className: "bg-indigo-100 text-indigo-700" },
  not_qualified: { label: "Não qualificado", className: "bg-orange-100 text-orange-700" },
  lost: { label: "Perdido", className: "bg-red-100 text-red-700" },
}
