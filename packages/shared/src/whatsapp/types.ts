/**
 * Story 50-3 (Epic 50): Tipos compartilhados para payloads do webhook WhatsApp.
 *
 * `WhatsAppReferral` representa o objeto `referral` que a Meta envia em
 * `entry[].changes[].value.messages[0].referral` quando um lead clica em
 * um anúncio Click-to-WhatsApp (CTWA) e é redirecionado para a conversa.
 *
 * Todos os campos são opcionais porque o shape pode variar entre Meta
 * Business Account e Cloud API (ver risco R2 da story 50-3).
 */
export interface WhatsAppReferral {
  /** URL do anúncio que originou o clique (pode conter parâmetros de tracking). */
  source_url?: string

  /** ID do anúncio Meta — equivale a `meta_ads.meta_ad_id`. Usado pelo CreativeChip. */
  source_id?: string

  /** Click ID do CTWA — útil para reconciliar com Insights API. */
  ctwa_clid?: string

  /** Tipo do criativo: tipicamente "ad" ou "post". */
  source_type?: "ad" | "post" | string

  /** Headline do criativo (curta). */
  headline?: string

  /** Body/copy do criativo. */
  body?: string

  /** Tipo de mídia do anúncio: "image", "video", "carousel", etc. */
  media_type?: string
}
