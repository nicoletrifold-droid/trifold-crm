import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

/**
 * GET /api/meta-ads/campaigns/[campaign_id]/creatives
 *
 * Returns per-ad performance metrics for a campaign within the selected
 * period, plus an "is_fatigued" flag computed on fixed absolute windows
 * (last 3 days vs days -10..-4) independent of the period filter.
 *
 * Story 26.1 — UI Performance por Criativo + Badge de Fadiga.
 */

interface AdCreativeMetrics {
  ad_id: string
  ad_name: string
  status: string
  // Period-window metrics
  spend: number
  impressions: number
  clicks: number
  ctr: number // clicks / impressions * 100 (%)
  cpm: number
  cpc: number | null
  leads: number
  cpl: number | null
  // Fatigue detection (absolute windows — independent of period param)
  ctr_last_3d: number
  ctr_prev_7d: number
  spend_3d: number
  is_fatigued: boolean
  fatigue_drop_pct: number | null
  // Creative metadata
  thumbnail_url: string | null
  ad_body: string | null
}

interface CreativesApiResponse {
  ads: AdCreativeMetrics[]
  fatigued_count: number
  period_days: number
}

function getPeriodDates(period: string): { from: string; to: string; days: number } {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0]!,
    to: to.toISOString().split("T")[0]!,
    days,
  }
}

function shiftDays(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]!
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

interface CreativeJson {
  thumbnail_url?: string | null
  body?: string | null
}

function parseCreative(raw: unknown): CreativeJson {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as CreativeJson
  }
  return {}
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { campaign_id: metaCampaignId } = await params
  const period = request.nextUrl.searchParams.get("period") ?? "30d"
  const { from, to, days } = getPeriodDates(period)

  // 1. Resolve Meta campaign_id (text) → internal uuid campaign.id
  const { data: campaignRow } = await supabase
    .from("meta_campaigns")
    .select("id")
    .eq("meta_campaign_id", metaCampaignId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!campaignRow) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  const campaignUuid = campaignRow.id as string

  // 2. Adsets of the campaign (returns uuid[] to filter ads)
  const { data: adsetRows } = await supabase
    .from("meta_adsets")
    .select("id")
    .eq("org_id", appUser.org_id)
    .eq("campaign_id", campaignUuid)

  const adsetUuids = (adsetRows ?? []).map((r) => r.id as string)

  if (adsetUuids.length === 0) {
    const empty: CreativesApiResponse = { ads: [], fatigued_count: 0, period_days: days }
    return NextResponse.json(empty)
  }

  // 3. Ads (with creative jsonb)
  const { data: adRows } = await supabase
    .from("meta_ads")
    .select("meta_ad_id, name, status, creative")
    .eq("org_id", appUser.org_id)
    .in("adset_id", adsetUuids)

  const ads = adRows ?? []
  if (ads.length === 0) {
    const empty: CreativesApiResponse = { ads: [], fatigued_count: 0, period_days: days }
    return NextResponse.json(empty)
  }

  const adIds = ads.map((a) => a.meta_ad_id as string)

  // 4. Insights — two parallel queries
  //    a) Period-window metrics (driven by `period` param)
  //    b) Fatigue-window metrics (last 10 days, ALWAYS absolute regardless of period)
  const minus3 = shiftDays(3)
  const minus4 = shiftDays(4)
  const minus10 = shiftDays(10)
  const today = shiftDays(0)

  const [periodResult, fatigueResult] = await Promise.all([
    supabase
      .from("meta_insights_daily")
      .select("entity_id, spend, impressions, clicks, leads")
      .eq("org_id", appUser.org_id)
      .eq("level", "ad")
      .in("entity_id", adIds)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("meta_insights_daily")
      .select("entity_id, date, spend, impressions, clicks")
      .eq("org_id", appUser.org_id)
      .eq("level", "ad")
      .in("entity_id", adIds)
      .gte("date", minus10)
      .lte("date", today),
  ])

  // 5. Aggregate period metrics per ad_id
  type PeriodAgg = { spend: number; impressions: number; clicks: number; leads: number }
  const periodMap = new Map<string, PeriodAgg>()
  for (const row of periodResult.data ?? []) {
    const id = row.entity_id as string
    const agg = periodMap.get(id) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    agg.spend += Number(row.spend ?? 0)
    agg.impressions += Number(row.impressions ?? 0)
    agg.clicks += Number(row.clicks ?? 0)
    agg.leads += Number(row.leads ?? 0)
    periodMap.set(id, agg)
  }

  // 6. Aggregate fatigue windows per ad_id
  //    last 3d: date >= minus3 (inclusive of today)
  //    prev 7d: date >= minus10 AND date <= minus4
  type FatigueAgg = {
    last3_clicks: number
    last3_impressions: number
    last3_spend: number
    prev_clicks: number
    prev_impressions: number
  }
  const fatigueMap = new Map<string, FatigueAgg>()
  for (const row of fatigueResult.data ?? []) {
    const id = row.entity_id as string
    const date = row.date as string
    const agg = fatigueMap.get(id) ?? {
      last3_clicks: 0,
      last3_impressions: 0,
      last3_spend: 0,
      prev_clicks: 0,
      prev_impressions: 0,
    }
    const clicks = Number(row.clicks ?? 0)
    const impressions = Number(row.impressions ?? 0)
    const spend = Number(row.spend ?? 0)
    if (date >= minus3) {
      agg.last3_clicks += clicks
      agg.last3_impressions += impressions
      agg.last3_spend += spend
    } else if (date >= minus10 && date <= minus4) {
      agg.prev_clicks += clicks
      agg.prev_impressions += impressions
    }
    fatigueMap.set(id, agg)
  }

  // 7. Build response per ad with metrics + fatigue
  const adCreatives: AdCreativeMetrics[] = ads.map((ad) => {
    const adId = ad.meta_ad_id as string
    const p = periodMap.get(adId) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    const f = fatigueMap.get(adId) ?? {
      last3_clicks: 0,
      last3_impressions: 0,
      last3_spend: 0,
      prev_clicks: 0,
      prev_impressions: 0,
    }

    const ctr = safeDiv(p.clicks, p.impressions) * 100
    const cpm = safeDiv(p.spend, p.impressions) * 1000
    const cpc = p.clicks > 0 ? p.spend / p.clicks : null
    const cpl = p.leads > 0 ? p.spend / p.leads : null

    const ctr_last_3d = safeDiv(f.last3_clicks, f.last3_impressions) * 100
    const ctr_prev_7d = safeDiv(f.prev_clicks, f.prev_impressions) * 100
    const spend_3d = f.last3_spend

    const is_fatigued =
      ctr_prev_7d > 0 && ctr_last_3d < ctr_prev_7d * 0.6 && spend_3d >= 30
    const fatigue_drop_pct =
      ctr_prev_7d > 0
        ? Math.round((1 - ctr_last_3d / ctr_prev_7d) * 100)
        : null

    const creative = parseCreative(ad.creative)

    return {
      ad_id: adId,
      ad_name: (ad.name as string) ?? "",
      status: (ad.status as string) ?? "",
      spend: Math.round(p.spend * 100) / 100,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: Math.round(ctr * 100) / 100,
      cpm: Math.round(cpm * 100) / 100,
      cpc: cpc !== null ? Math.round(cpc * 100) / 100 : null,
      leads: p.leads,
      cpl: cpl !== null ? Math.round(cpl * 100) / 100 : null,
      ctr_last_3d: Math.round(ctr_last_3d * 100) / 100,
      ctr_prev_7d: Math.round(ctr_prev_7d * 100) / 100,
      spend_3d: Math.round(spend_3d * 100) / 100,
      is_fatigued,
      fatigue_drop_pct,
      thumbnail_url: creative.thumbnail_url ?? null,
      ad_body: creative.body ?? null,
    }
  })

  // 8. Sort: fatigued first, then by spend DESC
  adCreatives.sort((a, b) => {
    if (a.is_fatigued !== b.is_fatigued) return a.is_fatigued ? -1 : 1
    return b.spend - a.spend
  })

  const fatigued_count = adCreatives.filter((a) => a.is_fatigued).length

  const response: CreativesApiResponse = {
    ads: adCreatives,
    fatigued_count,
    period_days: days,
  }

  return NextResponse.json(response)
}
