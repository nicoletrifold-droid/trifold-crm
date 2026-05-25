import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import type {
  AssociatedLead,
  CampaignDetailApiResponse,
  ConversionFunnel,
  MetaAdSetWithMetrics,
  MetaCampaignDetail,
  MetaInsightTimeSeries,
  RoasSummary,
} from "@trifold/shared"

// ─── Types (raw rows from DB) ──────────────────────────────────────────────

interface CampaignRow {
  id: string
  meta_campaign_id: string
  name: string | null
  objective: string | null
  status: string | null
  daily_budget: number | string | null
  lifetime_budget: number | string | null
  start_time: string | null
  stop_time: string | null
}

interface CampaignInsightRow {
  date: string
  spend: number | string | null
  impressions: number | null
  clicks: number | null
  ctr: number | string | null
  leads: number | null
}

interface AdsetRow {
  id: string
  meta_adset_id: string
  name: string | null
  status: string | null
  optimization_goal: string | null
  daily_budget: number | string | null
}

interface AdsetInsightRow {
  entity_id: string
  spend: number | string | null
  impressions: number | null
  clicks: number | null
  ctr: number | string | null
  leads: number | null
}

interface LeadRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  source: string | null
  utm_campaign: string | null
  created_at: string
  stage: { type: string | null } | { type: string | null }[] | null
  qualification_status: string | null
  visit_scheduled_at: string | null
}

interface LeadStatusRow {
  stage: { type: string | null } | { type: string | null }[] | null
  qualification_status: string | null
  visit_scheduled_at: string | null
}

interface RoasRow {
  total_spend: number | string | null
  leads_in_crm: number | null
  sales_count: number | null
  total_revenue: number | string | null
  roas: number | string | null
  cpl_real: number | string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseDays(raw: string | null): number {
  const n = parseInt(raw ?? "30", 10)
  if (Number.isNaN(n) || n <= 0) return 30
  // Limit to sensible window (max 90 per AC9 — but cap at 365 to be safe)
  return Math.min(n, 365)
}

function getPeriodDates(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0]!,
    to: to.toISOString().split("T")[0]!,
  }
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : 0
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

function toNullableInt(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Number.isFinite(value) ? value : null
}

function buildTimeseries(
  insights: CampaignInsightRow[],
  from: string,
  to: string,
): MetaInsightTimeSeries[] {
  const map = new Map<string, CampaignInsightRow>()
  for (const row of insights) {
    map.set(row.date, row)
  }

  const result: MetaInsightTimeSeries[] = []
  const cursor = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  while (cursor <= end) {
    const dateStr = cursor.toISOString().split("T")[0]!
    const row = map.get(dateStr)
    result.push({
      date: dateStr,
      spend: row ? Math.round(toNumber(row.spend) * 100) / 100 : 0,
      leads_meta: row?.leads ?? 0,
      impressions: row?.impressions ?? 0,
      clicks: row?.clicks ?? 0,
      ctr: row ? Math.round(toNumber(row.ctr) * 100) / 100 : 0,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}

function buildAdsetMetrics(
  adsets: AdsetRow[],
  insights: AdsetInsightRow[],
): MetaAdSetWithMetrics[] {
  const insightMap = new Map<
    string,
    { spend: number; impressions: number; clicks: number; leads: number }
  >()
  for (const ins of insights) {
    const acc = insightMap.get(ins.entity_id) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
    }
    acc.spend += toNumber(ins.spend)
    acc.impressions += ins.impressions ?? 0
    acc.clicks += ins.clicks ?? 0
    acc.leads += ins.leads ?? 0
    insightMap.set(ins.entity_id, acc)
  }

  return adsets
    .map((adset): MetaAdSetWithMetrics => {
      const m = insightMap.get(adset.meta_adset_id)
      const spend = m?.spend ?? 0
      const impressions = m?.impressions ?? 0
      const clicks = m?.clicks ?? 0
      const leads = m?.leads ?? 0
      // CTR derived from aggregated totals (not averaged) — more accurate
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
      const cpl = leads > 0 ? spend / leads : null

      return {
        id: adset.id,
        meta_adset_id: adset.meta_adset_id,
        name: adset.name ?? "",
        status: adset.status ?? "",
        optimization_goal: adset.optimization_goal ?? null,
        daily_budget: toNullableNumber(adset.daily_budget),
        spend: Math.round(spend * 100) / 100,
        impressions,
        clicks,
        ctr: Math.round(ctr * 100) / 100,
        leads_meta: leads,
        cpl: cpl !== null ? Math.round(cpl * 100) / 100 : null,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

// Stage types that count as "qualified" or downstream
const QUALIFIED_STAGE_TYPES = new Set([
  "qualificado",
  "agendado",
  "visitou",
  "proposta",
  "fechado",
])
const VISIT_STAGE_TYPES = new Set([
  "agendado",
  "visitou",
  "proposta",
  "fechado",
])
const SOLD_STAGE_TYPES = new Set(["fechado"])

function getStageType(
  stage: { type: string | null } | { type: string | null }[] | null,
): string | null {
  if (!stage) return null
  if (Array.isArray(stage)) {
    return stage[0]?.type ?? null
  }
  return stage.type ?? null
}

function isQualified(lead: LeadStatusRow): boolean {
  const stageType = getStageType(lead.stage)
  if (stageType && QUALIFIED_STAGE_TYPES.has(stageType)) return true
  return lead.qualification_status === "qualified"
}

function hasScheduledVisit(lead: LeadStatusRow): boolean {
  const stageType = getStageType(lead.stage)
  if (stageType && VISIT_STAGE_TYPES.has(stageType)) return true
  return Boolean(lead.visit_scheduled_at)
}

function isSold(lead: LeadStatusRow): boolean {
  const stageType = getStageType(lead.stage)
  return stageType ? SOLD_STAGE_TYPES.has(stageType) : false
}

function buildFunnel(
  campaignInsights: CampaignInsightRow[],
  allLeads: LeadStatusRow[],
): ConversionFunnel {
  const leads_meta = campaignInsights.reduce(
    (sum, i) => sum + (i.leads ?? 0),
    0,
  )
  const leads_crm = allLeads.length
  const leads_qualified = allLeads.filter(isQualified).length
  const visits_scheduled = allLeads.filter(hasScheduledVisit).length
  const sales = allLeads.filter(isSold).length
  return { leads_meta, leads_crm, leads_qualified, visits_scheduled, sales }
}

function deriveLeadStatus(lead: LeadRow): string {
  const stageType = getStageType(lead.stage)
  if (stageType) return stageType
  if (lead.qualification_status) return lead.qualification_status
  return "novo"
}

// ─── GET handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { campaign_id: metaCampaignId } = await params
  const days = parseDays(request.nextUrl.searchParams.get("days"))

  // 1. Campaign header (404 if not found or different org)
  const { data: campaignRow } = await supabase
    .from("meta_campaigns")
    .select(
      "id, meta_campaign_id, name, objective, status, daily_budget, lifetime_budget, start_time, stop_time",
    )
    .eq("meta_campaign_id", metaCampaignId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  const campaign = campaignRow as CampaignRow | null
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 },
    )
  }

  // 2. Time series (level=campaign)
  const { from, to } = getPeriodDates(days)
  const { data: rawCampaignInsights } = await supabase
    .from("meta_insights_daily")
    .select("date, spend, impressions, clicks, ctr, leads")
    .eq("org_id", appUser.org_id)
    .eq("level", "campaign")
    .eq("entity_id", metaCampaignId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })

  const campaignInsights = (rawCampaignInsights ?? []) as CampaignInsightRow[]

  // 3. AdSets — note: meta_adsets.campaign_id is UUID FK to meta_campaigns.id
  const { data: rawAdsets } = await supabase
    .from("meta_adsets")
    .select("id, meta_adset_id, name, status, optimization_goal, daily_budget")
    .eq("org_id", appUser.org_id)
    .eq("campaign_id", campaign.id)

  const adsets = (rawAdsets ?? []) as AdsetRow[]

  // 4. AdSet insights aggregated for the period
  const adsetMetaIds = adsets.map((a) => a.meta_adset_id)
  let adsetInsights: AdsetInsightRow[] = []
  if (adsetMetaIds.length > 0) {
    const { data: rawAdsetInsights } = await supabase
      .from("meta_insights_daily")
      .select("entity_id, spend, impressions, clicks, ctr, leads")
      .eq("org_id", appUser.org_id)
      .eq("level", "adset")
      .in("entity_id", adsetMetaIds)
      .gte("date", from)
      .lte("date", to)
    adsetInsights = (rawAdsetInsights ?? []) as AdsetInsightRow[]
  }

  // 5. Leads associated with this campaign — via utm_campaign match.
  // (Schema note: leads has no `metadata` jsonb column nor `meta_campaign_id`,
  // so association is via utm_campaign = campaign.name. This is the only
  // signal the schema currently provides for Story 16.9.)
  const campaignName = campaign.name ?? ""

  const leadsBaseSelect =
    "id, name, phone, email, source, utm_campaign, created_at, qualification_status, visit_scheduled_at, stage:kanban_stages(type)"

  const recentLeadsResult = campaignName
    ? await supabase
        .from("leads")
        .select(leadsBaseSelect)
        .eq("org_id", appUser.org_id)
        .eq("utm_campaign", campaignName)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as LeadRow[] }

  const recentLeads = (recentLeadsResult.data ?? []) as LeadRow[]

  // 6. All leads (status only, for funnel counts) — same association rule
  const allLeadsResult = campaignName
    ? await supabase
        .from("leads")
        .select(
          "qualification_status, visit_scheduled_at, stage:kanban_stages(type)",
        )
        .eq("org_id", appUser.org_id)
        .eq("utm_campaign", campaignName)
    : { data: [] as LeadStatusRow[] }

  const allLeadsForFunnel = (allLeadsResult.data ?? []) as LeadStatusRow[]

  // 7. ROAS — graceful fallback if view doesn't exist
  let roas_summary: RoasSummary | null = null
  try {
    const roasResult = await supabase
      .from("meta_campaign_roas")
      .select(
        "total_spend, leads_in_crm, sales_count, total_revenue, roas, cpl_real",
      )
      .eq("meta_campaign_id", metaCampaignId)
      .eq("org_id", appUser.org_id)
      .maybeSingle()

    // Treat any error code (view missing, RLS, etc.) as "no ROAS yet"
    if (!roasResult.error && roasResult.data) {
      const roasRow = roasResult.data as RoasRow
      roas_summary = {
        total_spend: toNumber(roasRow.total_spend),
        leads_in_crm: roasRow.leads_in_crm ?? 0,
        sales_count: roasRow.sales_count ?? 0,
        total_revenue: toNumber(roasRow.total_revenue),
        roas: toNullableNumber(roasRow.roas),
        cpl_real: toNullableNumber(roasRow.cpl_real),
      }
    }
  } catch {
    // View doesn't exist yet (Story 16.10) — silent fallback
    roas_summary = null
  }

  // 8. Build response
  const status = (campaign.status ?? "ACTIVE") as MetaCampaignDetail["status"]

  const detail: MetaCampaignDetail = {
    id: campaign.id,
    meta_campaign_id: campaign.meta_campaign_id,
    name: campaign.name ?? "",
    objective: campaign.objective ?? null,
    status,
    daily_budget: toNullableInt(
      typeof campaign.daily_budget === "string"
        ? Number(campaign.daily_budget)
        : campaign.daily_budget ?? null,
    ),
    lifetime_budget: toNullableInt(
      typeof campaign.lifetime_budget === "string"
        ? Number(campaign.lifetime_budget)
        : campaign.lifetime_budget ?? null,
    ),
    start_time: campaign.start_time ?? null,
    stop_time: campaign.stop_time ?? null,
  }

  const leadsResponse: AssociatedLead[] = recentLeads.map((l) => ({
    id: l.id,
    name: l.name ?? null,
    phone: l.phone ?? null,
    email: l.email ?? null,
    status: deriveLeadStatus(l),
    source: l.source ?? "",
    utm_campaign: l.utm_campaign ?? null,
    created_at: l.created_at,
  }))

  const response: CampaignDetailApiResponse = {
    campaign: detail,
    timeseries: buildTimeseries(campaignInsights, from, to),
    adsets: buildAdsetMetrics(adsets, adsetInsights),
    funnel: buildFunnel(campaignInsights, allLeadsForFunnel),
    leads: leadsResponse,
    roas_summary,
  }

  return NextResponse.json(response)
}
