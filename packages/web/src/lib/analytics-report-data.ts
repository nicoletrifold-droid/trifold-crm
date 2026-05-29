import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AnalyticsReportData } from "@web/lib/pdf/analytics-report-pdf"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"

type AnalyticsFunnelEntry = { stage_id: string; name: string; slug: string; color: string; position: number; count: number | string }
type AnalyticsPropertyEntry = { property_id: string; name: string; count: number | string }
type AnalyticsBrokerEntry = { user_id: string; name: string; count: number | string; avg_score: number | null }
type AnalyticsSummary = {
  funnel: AnalyticsFunnelEntry[] | null
  by_property: AnalyticsPropertyEntry[] | null
  by_broker: AnalyticsBrokerEntry[] | null
  source_counts: Record<string, number | string> | null
  lost_reasons: Record<string, number | string> | null
  total_leads: number | string
  new_leads: number | string
}

const toN = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

const HIDDEN_BROKERS = new Set(["corretor demo", "target editado"])

export async function buildAnalyticsReportData(
  supabase: SupabaseClient,
  orgId: string
): Promise<AnalyticsReportData> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [
    { count: totalLeads },
    { count: leadsToday },
    { count: leadsWeek },
    { count: leadsMonth },
    { data: analytics },
    { count: lpYardenCount },
    { count: lpVindCount },
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true).eq("org_id", orgId),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", todayStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", weekStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart.toISOString()),
    supabase.rpc("get_analytics_summary", { p_org_id: orgId, p_since: monthStart.toISOString() }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart.toISOString()).ilike("utm_campaign", "%LP Yarden%"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart.toISOString()).or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%"),
  ])

  const summary = (analytics as AnalyticsSummary | null) ?? null

  const stages = (summary?.funnel ?? []).map((st) => ({
    name: st.name,
    color: st.color,
    count: toN(st.count),
  }))

  const properties = (summary?.by_property ?? []).map((p) => ({
    name: p.name,
    count: toN(p.count),
  }))

  const brokers = (summary?.by_broker ?? [])
    .filter((b) => !HIDDEN_BROKERS.has((b.name ?? "").toLowerCase().trim()))
    .map((b) => ({ name: b.name, count: toN(b.count) }))

  const sourceCounts: Record<string, number> = {}
  for (const [k, v] of Object.entries(summary?.source_counts ?? {})) {
    sourceCounts[k] = toN(v)
  }

  const lpYarden = lpYardenCount ?? 0
  const lpVind = lpVindCount ?? 0
  if (lpYarden > 0) {
    sourceCounts["lp_yarden"] = lpYarden
    sourceCounts.other = Math.max(0, (sourceCounts.other ?? 0) - lpYarden)
  }
  if (lpVind > 0) {
    sourceCounts["lp_vind"] = lpVind
    sourceCounts.other = Math.max(0, (sourceCounts.other ?? 0) - lpVind)
  }
  if (sourceCounts.other === 0) delete sourceCounts.other

  const sources = Object.entries(sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({ label: SOURCE_LABELS_SHORT[key] ?? key, count }))

  const lostReasons = Object.entries(summary?.lost_reasons ?? {})
    .sort(([, a], [, b]) => toN(b) - toN(a))
    .map(([reason, count]) => ({ reason, count: toN(count) }))

  const generatedAt = now.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" })

  const weekRange = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`

  return {
    generatedAt,
    weekRange,
    totalLeads: totalLeads ?? 0,
    leadsToday: leadsToday ?? 0,
    leadsWeek: leadsWeek ?? 0,
    leadsMonth: leadsMonth ?? 0,
    stages,
    properties,
    sources,
    brokers,
    lostReasons,
  }
}
