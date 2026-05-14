import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import { LeadsChart } from "@web/components/analytics/leads-chart"

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

export default async function AnalyticsPage() {
  const appUser = await getServerUser()
  const supabase = await createClient()

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
    { data: analytics, error: analyticsError },
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    supabase.rpc("get_analytics_summary", {
      p_org_id: appUser.orgId,
      p_since: monthStart.toISOString(),
    }),
  ])

  if (analyticsError) {
    console.error("[ANALYTICS] get_analytics_summary RPC failed", analyticsError)
  }

  const summary = (analytics as AnalyticsSummary | null) ?? null

  const stages = (summary?.funnel ?? []).map((s) => ({
    id: s.stage_id,
    name: s.name,
    slug: s.slug,
    color: s.color,
    position: s.position,
    count: toCount(s.count),
  }))

  const properties = (summary?.by_property ?? []).map((p) => ({
    id: p.property_id,
    name: p.name,
    count: toCount(p.count),
  }))

  const brokers = (summary?.by_broker ?? []).map((b) => ({
    id: b.user_id,
    name: b.name,
    count: toCount(b.count),
    avgScore: b.avg_score ?? 0,
  }))

  const sourceCountsRaw = summary?.source_counts ?? {}
  const sourceCounts: Record<string, number> = {}
  for (const [k, v] of Object.entries(sourceCountsRaw)) {
    sourceCounts[k] = toCount(v)
  }

  const lostReasonsRaw = summary?.lost_reasons ?? {}
  const lostReasons: Record<string, number> = {}
  for (const [k, v] of Object.entries(lostReasonsRaw)) {
    lostReasons[k] = toCount(v)
  }

  const sourceLabels = SOURCE_LABELS_SHORT
  const maxFunnelCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Analytics</h1>

      {/* Leads por Período — gráfico interativo com filtros (AC3-AC7) */}
      <LeadsChart properties={properties.map((p) => ({ id: p.id, name: p.name }))} />

      {/* Period Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Total de leads</p>
          <p className="mt-1 text-3xl font-bold dark:text-stone-100">{totalLeads ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Hoje</p>
          <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-300">{leadsToday ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Esta semana</p>
          <p className="mt-1 text-3xl font-bold text-blue-600 dark:text-blue-300">{leadsWeek ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Este mês</p>
          <p className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-300">{leadsMonth ?? 0}</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Funil de Conversão</h2>
        <div className="space-y-2">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-3">
              <span className="w-32 text-sm text-gray-600 dark:text-stone-300">{stage.name}</span>
              <div className="flex-1">
                <div
                  className="h-6 rounded"
                  style={{
                    width: `${Math.max((stage.count / maxFunnelCount) * 100, 2)}%`,
                    backgroundColor: stage.color,
                    opacity: 0.8,
                  }}
                />
              </div>
              <span className="w-10 text-right text-sm font-medium dark:text-stone-100">{stage.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By Property */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Empreendimento</h2>
          <div className="space-y-3">
            {properties.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-stone-300">{p.name}</span>
                <span className="rounded-full bg-orange-100 px-3 py-0.5 text-sm font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                  {p.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* By Source */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Origem (mês)</h2>
          <div className="space-y-3">
            {Object.entries(sourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-stone-300">
                    {sourceLabels[source] ?? source}
                  </span>
                  <span className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                    {count}
                  </span>
                </div>
              ))}
            {Object.keys(sourceCounts).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead este mês.</p>
            )}
          </div>
        </div>

        {/* Broker Performance */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Performance por Corretor</h2>
          <div className="space-y-3">
            {brokers.map((broker) => (
              <div key={broker.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-stone-300">{broker.name}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-stone-100">
                  {broker.count} leads
                </span>
              </div>
            ))}
            {brokers.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum corretor cadastrado.</p>
            )}
          </div>
        </div>

        {/* Lost Reasons */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Motivos de Perda</h2>
          <div className="space-y-3">
            {Object.entries(lostReasons)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-stone-300">{reason}</span>
                  <span className="rounded-full bg-red-100 px-3 py-0.5 text-sm font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                    {count}
                  </span>
                </div>
              ))}
            {Object.keys(lostReasons).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead perdido.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
