/**
 * Story 50-3 (Epic 50): Pure helper para mesclar `leads.metadata` em fluxo CTWA.
 *
 * Extraído do handler `route.ts` para testabilidade isolada — não tem dependências
 * de Supabase / Next.js. Recebe o metadata atual + payload de referral + base de
 * tempo, devolve o objeto a ser persistido.
 *
 * Regras (espelho de AC1-AC4):
 *  - `ad_id` em re-engajamento: preserva o valor existente se já houver (AC3),
 *    senão usa `referral.source_id`.
 *  - `campaign_id` em re-engajamento (Story 75-208 Item 3 / AC3.2): preserva o
 *    valor existente se já houver, senão usa `resolvedCampaignId` (resultado do
 *    lookup local meta_ads → meta_adsets → meta_campaigns). NUNCA sobrescreve
 *    uma atribuição prévia válida com `null` quando o lookup falha. O valor
 *    persistido é o `meta_campaigns.meta_campaign_id` (ID da Meta), pois é
 *    contra ele que os dual-joins de `campaigns/route.ts` e
 *    `campaigns/[campaign_id]/funnel/route.ts` comparam `metadata->>campaign_id`.
 *  - Demais campos (source_url, ctwa_clid, headline, body, media_type) são
 *    sobrescritos pelo payload corrente (último valor vence) — refletem o
 *    último anúncio clicado.
 *  - `ctwa_window_expires_at` recalculado como baseTime + 72h.
 */
import type { WhatsAppReferral } from "@trifold/shared"

export interface CtwaMetadataInput {
  /** Metadata atual do lead (pode ser null/undefined em leads novos). */
  currentMetadata?: Record<string, unknown> | null
  /** Payload `referral` recebido do webhook WhatsApp. */
  referral: WhatsAppReferral
  /**
   * Timestamp ISO/epoch usado para calcular a janela CTWA de 72h.
   * Tipicamente `lead.created_at` para leads novos, `Date.now()` como fallback.
   */
  baseTimestampMs: number
  /**
   * `meta_campaigns.meta_campaign_id` resolvido via lookup local
   * (`meta_ads.meta_ad_id` = `referral.source_id` → `meta_ads.adset_id` →
   * `meta_adsets.campaign_id` → `meta_campaigns`). Opcional: `null`/`undefined`
   * quando o lookup falha (ad não sincronizado, adset/campanha ausentes).
   * Story 75-208 Item 3 / AC3.2. NÃO é o UUID interno `meta_campaigns.id` —
   * é o ID da Meta usado no dual-join dos endpoints de campanha.
   */
  resolvedCampaignId?: string | null
}

export interface CtwaMetadataResult {
  ad_id: string | null
  /**
   * `meta_campaigns.meta_campaign_id` atribuído a este lead. Preserva a
   * atribuição prévia em re-engajamento (Story 75-208 Item 3 / AC3.2).
   */
  campaign_id: string | null
  source_url: string | null
  ctwa_clid: string | null
  headline: string | null
  body: string | null
  media_type: string | null
  ctwa_window_expires_at: string
  // Demais campos preservados via spread do current
  [key: string]: unknown
}

const CTWA_WINDOW_MS = 72 * 60 * 60 * 1000

/**
 * Constrói o objeto `metadata` final a ser persistido em `leads.metadata`.
 *
 * @param input - Metadata atual + referral payload + baseTimestamp.
 * @returns Metadata mesclado pronto para `UPDATE leads SET metadata = ...`.
 */
export function buildCtwaMetadata(input: CtwaMetadataInput): CtwaMetadataResult {
  const { currentMetadata, referral, baseTimestampMs, resolvedCampaignId } =
    input

  const current = (currentMetadata ?? {}) as Record<string, unknown>

  const incomingAdId = referral.source_id ?? null
  const existingAdId = current.ad_id
  const preservedAdId =
    typeof existingAdId === "string" && existingAdId.length > 0
      ? existingAdId
      : incomingAdId

  // campaign_id (Story 75-208 Item 3 / AC3.2): mesma regra de preservação do
  // ad_id. Preserva a atribuição prévia válida; só grava o valor recém-resolvido
  // quando não há um campaign_id já persistido. NUNCA sobrescreve com null em
  // falha de lookup de re-engajamento.
  const incomingCampaignId =
    typeof resolvedCampaignId === "string" && resolvedCampaignId.length > 0
      ? resolvedCampaignId
      : null
  const existingCampaignId = current.campaign_id
  const preservedCampaignId =
    typeof existingCampaignId === "string" && existingCampaignId.length > 0
      ? existingCampaignId
      : incomingCampaignId

  const ctwaWindowExpiresAt = new Date(
    baseTimestampMs + CTWA_WINDOW_MS,
  ).toISOString()

  // Spread current primeiro (preserva campos previamente populados pelo webhook
  // Meta — ex: form_id), depois sobrescreve com o payload novo, depois força
  // preservação do ad_id/campaign_id histórico.
  return {
    ...current,
    ad_id: preservedAdId,
    campaign_id: preservedCampaignId,
    source_url: referral.source_url ?? null,
    ctwa_clid: referral.ctwa_clid ?? null,
    headline: referral.headline ?? null,
    body: referral.body ?? null,
    media_type: referral.media_type ?? null,
    ctwa_window_expires_at: ctwaWindowExpiresAt,
  }
}
