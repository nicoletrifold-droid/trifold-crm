import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

// Story 30.1: shape do retorno da RPC public.get_analytics_summary(uuid, timestamptz)
// bigints (count, total_leads, new_leads) podem chegar como string — castar via Number().
type AnalyticsFunnelEntry = {
  stage_id: string
  name: string
  slug: string
  color: string
  position: number
  count: number | string
}
type AnalyticsPropertyEntry = {
  property_id: string
  name: string
  count: number | string
}
type AnalyticsBrokerEntry = {
  user_id: string
  name: string
  count: number | string
  avg_score: number | null
}
type AnalyticsSummary = {
  funnel: AnalyticsFunnelEntry[] | null
  by_property: AnalyticsPropertyEntry[] | null
  by_broker: AnalyticsBrokerEntry[] | null
  source_counts: Record<string, number | string> | null
  lost_reasons: Record<string, number | string> | null
  total_leads: number | string
  new_leads: number | string
}

const toCount = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Only admin/supervisor can access analytics
  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  const searchParams = request.nextUrl.searchParams
  const period = searchParams.get("period") ?? "month" // day, week, month
  const now = new Date()
  let since: Date

  switch (period) {
    case "day":
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case "week":
      since = new Date(now)
      since.setDate(since.getDate() - since.getDay() + 1)
      since.setHours(0, 0, 0, 0)
      break
    default:
      since = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const sinceISO = since.toISOString()

  const { data: analytics, error: analyticsError } = await supabase.rpc(
    "get_analytics_summary",
    { p_org_id: appUser.org_id, p_since: sinceISO },
  )

  if (analyticsError) {
    console.error("[/api/analytics] get_analytics_summary RPC failed", analyticsError)
    return NextResponse.json({ error: analyticsError.message }, { status: 500 })
  }

  const summary = (analytics as AnalyticsSummary | null) ?? null

  // Funnel — mapeia para shape histórico (sem stage_id/position, mantém slug)
  const funnel = (summary?.funnel ?? []).map((s) => ({
    name: s.name,
    slug: s.slug,
    color: s.color,
    count: toCount(s.count),
  }))

  // byProperty — shape histórico { name, count }
  const byProperty = (summary?.by_property ?? []).map((p) => ({
    name: p.name,
    count: toCount(p.count),
  }))

  // bySource — Record<string, number>
  const bySource: Record<string, number> = {}
  for (const [k, v] of Object.entries(summary?.source_counts ?? {})) {
    bySource[k] = toCount(v)
  }

  // brokerPerformance — shape histórico { name, totalLeads, avgScore }
  const brokerPerformance = (summary?.by_broker ?? []).map((b) => ({
    name: b.name,
    totalLeads: toCount(b.count),
    avgScore: b.avg_score ?? 0,
  }))

  // lostReasons — Record<string, number>
  const lostReasons: Record<string, number> = {}
  for (const [k, v] of Object.entries(summary?.lost_reasons ?? {})) {
    lostReasons[k] = toCount(v)
  }

  return NextResponse.json({
    data: {
      totalLeads: toCount(summary?.total_leads),
      newLeads: toCount(summary?.new_leads),
      funnel,
      byProperty,
      bySource,
      brokerPerformance,
      lostReasons,
      period,
    },
  })
}
