import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

interface CampaignMetrics {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpl: number | null
  leads_meta: number
}

interface CampaignWithMetrics {
  id: string
  meta_campaign_id: string
  name: string
  objective: string | null
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED"
  daily_budget: number | null
  lifetime_budget: number | null
  metrics: CampaignMetrics
  leads_crm: number
}

interface SyncStatus {
  started_at: string
  status: "running" | "success" | "error"
  records_synced: number
}

interface CampaignsApiResponse {
  campaigns: CampaignWithMetrics[]
  last_sync: SyncStatus | null
}

function getPeriodDates(period: string): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { supabase, appUser } = auth
  const { searchParams } = request.nextUrl

  const period = searchParams.get("period") ?? "30d"
  const statusFilter = searchParams.get("status") ?? "ALL"

  // 1. Campanhas da org
  let campaignsQuery = supabase
    .from("meta_campaigns")
    .select("id, meta_campaign_id, name, objective, status, daily_budget, lifetime_budget")
    .eq("org_id", appUser.org_id)
    .order("name")

  if (statusFilter !== "ALL") {
    campaignsQuery = campaignsQuery.eq("status", statusFilter)
  }

  const { data: campaigns, error: campaignsError } = await campaignsQuery
  if (campaignsError) {
    return NextResponse.json({ error: campaignsError.message }, { status: 500 })
  }

  // 2. Insights do período (level=campaign)
  const { from, to } = getPeriodDates(period)
  const { data: insights } = await supabase
    .from("meta_insights_daily")
    .select("entity_id, spend, impressions, clicks, leads")
    .eq("org_id", appUser.org_id)
    .eq("level", "campaign")
    .gte("date", from)
    .lte("date", to)

  // 3. Leads no CRM (meta_ads ou ctwa)
  const { data: leads } = await supabase
    .from("leads")
    .select("id, utm_campaign, metadata")
    .eq("org_id", appUser.org_id)
    .in("source", ["meta_ads", "whatsapp_click_to_ad"])

  // 4. Agregar insights por entity_id (meta_campaign_id)
  const insightsByEntity: Record<string, { spend: number; impressions: number; clicks: number; leads_meta: number }> =
    {}

  for (const insight of insights ?? []) {
    const eid = insight.entity_id
    if (!insightsByEntity[eid]) {
      insightsByEntity[eid] = { spend: 0, impressions: 0, clicks: 0, leads_meta: 0 }
    }
    const agg = insightsByEntity[eid]
    agg.spend += Number(insight.spend ?? 0)
    agg.impressions += Number(insight.impressions ?? 0)
    agg.clicks += Number(insight.clicks ?? 0)
    agg.leads_meta += Number(insight.leads ?? 0)
  }

  // 5. Índices de leads por campanha (dedup por id)
  const leadIdsByName: Record<string, Set<string>> = {}
  const leadIdsByMetaId: Record<string, Set<string>> = {}

  for (const lead of leads ?? []) {
    const metaId = (lead.metadata as Record<string, unknown> | null)?.campaign_id as string | undefined

    if (lead.utm_campaign) {
      if (!leadIdsByName[lead.utm_campaign]) leadIdsByName[lead.utm_campaign] = new Set()
      leadIdsByName[lead.utm_campaign].add(lead.id)
    }
    if (metaId) {
      if (!leadIdsByMetaId[metaId]) leadIdsByMetaId[metaId] = new Set()
      leadIdsByMetaId[metaId].add(lead.id)
    }
  }

  // 6. Montar resultado
  const result: CampaignWithMetrics[] = (campaigns ?? []).map((c) => {
    const agg = insightsByEntity[c.meta_campaign_id] ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads_meta: 0,
    }

    const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0
    const cpl = agg.leads_meta > 0 ? agg.spend / agg.leads_meta : null

    // Dedup leads CRM: união dos dois conjuntos
    const byName = leadIdsByName[c.name] ?? new Set<string>()
    const byMetaId = leadIdsByMetaId[c.meta_campaign_id] ?? new Set<string>()
    const leads_crm = new Set([...byName, ...byMetaId]).size

    return {
      id: c.id,
      meta_campaign_id: c.meta_campaign_id,
      name: c.name ?? "",
      objective: c.objective ?? null,
      status: c.status as CampaignWithMetrics["status"],
      daily_budget: c.daily_budget ?? null,
      lifetime_budget: c.lifetime_budget ?? null,
      metrics: {
        spend: Math.round(agg.spend * 100) / 100,
        impressions: agg.impressions,
        clicks: agg.clicks,
        ctr: Math.round(ctr * 100) / 100,
        cpl: cpl !== null ? Math.round(cpl * 100) / 100 : null,
        leads_meta: agg.leads_meta,
      },
      leads_crm,
    }
  })

  // 7. Última sincronização de entidades
  const { data: lastSync } = await supabase
    .from("meta_sync_log")
    .select("started_at, status, records_synced")
    .eq("org_id", appUser.org_id)
    .eq("sync_type", "entities")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const response: CampaignsApiResponse = {
    campaigns: result,
    last_sync: lastSync
      ? {
          started_at: lastSync.started_at,
          status: lastSync.status as SyncStatus["status"],
          records_synced: lastSync.records_synced ?? 0,
        }
      : null,
  }

  return NextResponse.json(response)
}
