/**
 * Story 50-2 (Epic 50): Tipos compartilhados do pipeline para attribution Meta.
 *
 * `CreativeData` é a forma compacta do criativo Meta que viaja do server (via
 * fetchCreativesForLeads) → KanbanBoard → KanbanColumn → LeadCard → CreativeChip.
 *
 * O shape é DERIVADO de `meta_ads.creative` (JSONB persistido pela Story 50-1)
 * mas plano e estável para consumo na UI.
 */
export interface CreativeData {
  /** meta_ad_id (TEXT da Graph API, ex.: "23845678901230000") */
  adId: string
  /** meta_ads.name — fallback "(sem nome)" se ausente */
  adName: string
  /** meta_campaigns.name resolvido via JOIN adsets→campaigns, ou null */
  campaignName: string | null
  /** Pequena (~150×150) — usado no CreativeChip */
  thumbnailUrl: string | null
  /** Maior (~600×600) — usado no CreativePreviewModal quando disponível */
  imageUrl: string | null
  /** meta_campaign_id (TEXT) — usado para deeplink ao painel de campanhas */
  metaCampaignId: string | null
}
