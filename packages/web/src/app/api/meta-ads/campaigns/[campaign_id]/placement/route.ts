import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export interface PlacementRow {
  publisher_platform: string
  platform_position: string
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number | null
  ctr: number
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { campaign_id: metaCampaignId } = await params

  // Anti-IDOR: verify campaign belongs to user's org
  const { data: campaign } = await supabase
    .from("meta_campaigns")
    .select("meta_campaign_id")
    .eq("meta_campaign_id", metaCampaignId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 })
  }

  const { data: rows, error } = await supabase
    .from("meta_insights_placement_daily")
    .select("publisher_platform, platform_position, spend, impressions, clicks, leads")
    .eq("org_id", appUser.org_id)
    .eq("campaign_id", metaCampaignId)
    .order("spend", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate by publisher_platform + platform_position (sum across dates)
  const agg = new Map<string, PlacementRow>()
  for (const r of rows ?? []) {
    const key = `${r.publisher_platform}::${r.platform_position}`
    const cur = agg.get(key) ?? {
      publisher_platform: r.publisher_platform,
      platform_position: r.platform_position,
      spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: null, ctr: 0,
    }
    cur.spend       += Number(r.spend ?? 0)
    cur.impressions += Number(r.impressions ?? 0)
    cur.clicks      += Number(r.clicks ?? 0)
    cur.leads       += Number(r.leads ?? 0)
    agg.set(key, cur)
  }

  const placements: PlacementRow[] = [...agg.values()]
    .map((p) => ({
      ...p,
      spend: Math.round(p.spend * 100) / 100,
      ctr: p.impressions > 0 ? Math.round((p.clicks / p.impressions) * 10000) / 100 : 0,
      cpl: p.leads > 0 ? Math.round((p.spend / p.leads) * 100) / 100 : null,
    }))
    .sort((a, b) => b.spend - a.spend)

  return NextResponse.json({ placements })
}
