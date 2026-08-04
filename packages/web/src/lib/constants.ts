export const INTEREST_LEVEL_LABELS: Record<string, string> = {
  cold: 'Frio',
  warm: 'Morno',
  hot: 'Quente',
};

export const INTEREST_LEVEL_COLORS: Record<string, string> = {
  cold: 'bg-blue-100 text-blue-700',
  warm: 'bg-yellow-100 text-yellow-700',
  hot: 'bg-red-100 text-red-700',
};

export const SOURCE_LABELS: Record<string, string> = {
  whatsapp_organic: 'WhatsApp Orgânico',
  whatsapp_click_to_ad: 'WhatsApp Patrocinado (Click-to-Ad)',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  website: 'Website',
  referral: 'Indicação',
  broker_sponsored: 'Patrocinado Corretor',
  walk_in: 'Walk-in',
  telegram: 'Telegram',
  imob_link: 'Link Imobiliária',
  other: 'Outro',
};

// "WhatsApp Patrocinado" = conversa de WhatsApp vinda de anúncio Meta CTWA
// (click-to-WhatsApp); "WhatsApp Orgânico" = chamou o número sem anúncio.
// Decisão Marcos 2026-07-23: o conceito precisa ficar explícito nos gráficos
// pra orientar decisão de campanha — e o rótulo bate em TODAS as telas
// (analytics, badges de lead, PDF) porque todas leem este mapa.
export const SOURCE_LABELS_SHORT: Record<string, string> = {
  whatsapp_organic: 'WhatsApp Orgânico',
  whatsapp_click_to_ad: 'WhatsApp Patrocinado',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  website: 'Website',
  referral: 'Indicação',
  broker_sponsored: 'Patrocinado Corretor',
  walk_in: 'Manual',
  telegram: 'Telegram',
  lp_yarden: 'Landing Page Yarden',
  lp_vind: 'Landing Page Vind',
  imob_link: 'Link Imob',
  other: 'Outro',
};

/**
 * Opções de Origem para o cadastro MANUAL de lead — fonte única usada tanto na
 * tela do admin (/dashboard/leads/new) quanto no modal do corretor (Story 75-111).
 * `value` deve ser um valor válido do enum Postgres `lead_source`.
 */
/**
 * Story 75-264 — Motivo de perda ESTRUTURADO (6 grupos + outro).
 * Fonte única para TODOS os pontos que marcam lead como perdido (modal do
 * drawer, ação em massa, modal do Kanban) e para a validação server-side
 * (mark-lost, bulk, PATCH). `value` deve casar com o CHECK
 * leads_lost_reason_grupo_check (migration 212) e com os grupos da view
 * v_lead_lost_reason_grupo. Taxonomia destilada de 1.042 perdas reais.
 */
export const LOST_REASON_GROUPS: { value: string; label: string }[] = [
  { value: 'nao_conseguimos_falar', label: 'Não conseguimos falar (não atende/não responde)' },
  { value: 'sem_interesse',         label: 'Sem interesse / desistiu' },
  { value: 'nao_qualifica_preco',   label: 'Não qualifica (renda, crédito, preço)' },
  { value: 'fora_perfil_regiao',    label: 'Fora do perfil / região' },
  { value: 'foi_para_outro',        label: 'Comprou outro imóvel / concorrente' },
  { value: 'clicou_sem_intencao',   label: 'Clicou sem intenção de compra' },
  { value: 'outro',                 label: 'Outro' },
];

export const LOST_REASON_GROUP_LABELS: Record<string, string> =
  Object.fromEntries(LOST_REASON_GROUPS.map((g) => [g.value, g.label]));

export function isLostReasonGrupo(value: unknown): value is string {
  return typeof value === 'string' && LOST_REASON_GROUPS.some((g) => g.value === value);
}

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'referral',         label: 'Indicação' },
  { value: 'broker_sponsored', label: 'Patrocinado Corretor' },
  { value: 'other',            label: 'Carteira Própria / Ação Externa' },
  { value: 'website',          label: 'Site' },
  { value: 'whatsapp_organic', label: 'WhatsApp Orgânico' },
  { value: 'meta_ads',         label: 'Meta Ads (Facebook/Instagram)' },
  { value: 'google_ads',       label: 'Google Ads' },
];
