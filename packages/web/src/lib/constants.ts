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
  whatsapp_click_to_ad: 'WhatsApp Click-to-Ad',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  website: 'Website',
  referral: 'Indicação',
  broker_sponsored: 'Patrocinado Corretor',
  walk_in: 'Walk-in',
  telegram: 'Telegram',
  other: 'Outro',
};

export const SOURCE_LABELS_SHORT: Record<string, string> = {
  whatsapp_organic: 'WhatsApp',
  whatsapp_click_to_ad: 'Click-to-Ad',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  website: 'Website',
  referral: 'Indicação',
  broker_sponsored: 'Patrocinado Corretor',
  telegram: 'Telegram',
  lp_yarden: 'Landing Page Yarden',
  lp_vind: 'Landing Page Vind',
  other: 'Outro',
};

/**
 * Opções de Origem para o cadastro MANUAL de lead — fonte única usada tanto na
 * tela do admin (/dashboard/leads/new) quanto no modal do corretor (Story 75-111).
 * `value` deve ser um valor válido do enum Postgres `lead_source`.
 */
export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'referral',         label: 'Indicação' },
  { value: 'broker_sponsored', label: 'Patrocinado Corretor' },
  { value: 'other',            label: 'Carteira Própria / Ação Externa' },
  { value: 'website',          label: 'Site' },
  { value: 'whatsapp_organic', label: 'WhatsApp Orgânico' },
  { value: 'meta_ads',         label: 'Meta Ads (Facebook/Instagram)' },
  { value: 'google_ads',       label: 'Google Ads' },
];
