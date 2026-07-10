/**
 * Story 50-2 (Epic 50): Batched lookup de criativos Meta para uma lista de leads.
 *
 * Performance contract (AC7):
 *   - Máximo 1 query Supabase para a página inteira do pipeline
 *   - Distinct ad_ids extraídos de `lead.metadata.ad_id`
 *   - Retorna Map<adId, CreativeData> — caller mapeia leads → creative
 *
 * Graceful degradation:
 *   - Leads sem `metadata.ad_id` → não fazem parte da query
 *   - Ads não encontrados em `meta_ads` → ausentes do Map (lead cai no fallback SourceBadge)
 *   - Query error → loga warning e retorna Map vazio (NUNCA quebra o pipeline)
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { CreativeData } from "./types"

/**
 * Quem enxerga o CreativeChip (miniatura do anúncio Meta) no pipeline.
 * TODOS os perfis internos que acessam o pipeline — incluindo o corretor (Story 50-5,
 * 2026-07-09). Os criativos são por-org (idênticos p/ todos) e `meta_ads` é legível por
 * qualquer usuário da org (RLS org_isolation). Antes o corretor caía no SourceBadge
 * (rollout progressivo das Stories 50-2 → 50-4); agora ele também vê a miniatura.
 */
export function canSeeCreatives(): boolean {
  return true
}

// Meta CDN URLs contêm o parâmetro `oe` (hex) com o timestamp Unix de expiração.
// Exemplo: ...&oe=6A3E9C8E → expira quando Unix.now() > 0x6A3E9C8E
function isMetaUrlValid(url: string | null | undefined): boolean {
  if (!url) return false
  const match = url.match(/[?&]oe=([0-9a-fA-F]+)/)
  if (!match?.[1]) return true // sem parâmetro oe → assume válido
  const expiresAt = parseInt(match[1], 16) * 1000
  return Date.now() < expiresAt
}

type LeadWithMetadata = {
  metadata?: Record<string, unknown> | null
}

type MetaAdRow = {
  meta_ad_id: string
  name: string | null
  creative: Record<string, unknown> | null
  // Embedded relations via PostgREST — podem vir como array OR object dependendo da config
  adsets:
    | {
        campaigns:
          | { name: string | null; meta_campaign_id: string | null }
          | Array<{ name: string | null; meta_campaign_id: string | null }>
          | null
      }
    | Array<{
        campaigns:
          | { name: string | null; meta_campaign_id: string | null }
          | Array<{ name: string | null; meta_campaign_id: string | null }>
          | null
      }>
    | null
}

function unwrapAdsets(adsets: MetaAdRow["adsets"]): {
  campaignName: string | null
  metaCampaignId: string | null
} {
  if (!adsets) return { campaignName: null, metaCampaignId: null }
  const first = Array.isArray(adsets) ? adsets[0] : adsets
  if (!first) return { campaignName: null, metaCampaignId: null }
  const campaigns = first.campaigns
  if (!campaigns) return { campaignName: null, metaCampaignId: null }
  const campaign = Array.isArray(campaigns) ? campaigns[0] : campaigns
  return {
    campaignName: campaign?.name ?? null,
    metaCampaignId: campaign?.meta_campaign_id ?? null,
  }
}

export async function fetchCreativesForLeads(
  supabase: SupabaseClient,
  leads: LeadWithMetadata[],
  orgId: string,
): Promise<Map<string, CreativeData>> {
  // Extrai ad_ids distintos de leads que têm metadata.ad_id
  const adIds = Array.from(
    new Set(
      leads
        .map((l) => {
          const meta = l.metadata as Record<string, unknown> | null | undefined
          const adId = meta?.ad_id
          return typeof adId === "string" && adId.length > 0 ? adId : null
        })
        .filter((v): v is string => v !== null),
    ),
  )

  if (adIds.length === 0) return new Map()

  // Single query com embed de adsets→campaigns
  const { data, error } = await supabase
    .from("meta_ads")
    .select(
      `
      meta_ad_id, name, creative,
      adsets:adset_id ( campaigns:campaign_id ( name, meta_campaign_id ) )
    `,
    )
    .in("meta_ad_id", adIds)
    .eq("org_id", orgId)

  if (error) {
    console.warn("[fetch-creatives] meta_ads lookup failed (degrading gracefully):", error.message)
    return new Map()
  }

  const map = new Map<string, CreativeData>()
  for (const row of (data ?? []) as MetaAdRow[]) {
    const creative = row.creative as Record<string, unknown> | null
    const { campaignName, metaCampaignId } = unwrapAdsets(row.adsets)

    const rawThumb = creative?.thumbnail_url as string | null | undefined
    const rawImage = creative?.image_url as string | null | undefined
    map.set(row.meta_ad_id, {
      adId: row.meta_ad_id,
      adName: row.name ?? "(sem nome)",
      campaignName,
      thumbnailUrl: isMetaUrlValid(rawThumb) ? (rawThumb ?? null) : null,
      imageUrl: isMetaUrlValid(rawImage) ? (rawImage ?? null) : null,
      metaCampaignId,
    })
  }
  return map
}

/**
 * Helper que extrai o ad_id de `lead.metadata` e devolve o creative correspondente
 * (ou null) — usado pelos page.tsx para fazer attach `lead.creative = ...`.
 */
export function resolveCreativeForLead(
  lead: LeadWithMetadata,
  map: Map<string, CreativeData>,
): CreativeData | null {
  const meta = lead.metadata as Record<string, unknown> | null | undefined
  const adId = meta?.ad_id
  if (typeof adId !== "string" || adId.length === 0) return null
  return map.get(adId) ?? null
}
