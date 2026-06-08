import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import { LeadsChart } from "@web/components/analytics/leads-chart"
import { ScrollableX } from "@web/components/ui/scrollable-x"

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

const HIDDEN_BROKER_NAMES = new Set(["corretor demo", "target editado"])

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>
}) {
  const appUser = await getServerUser()
  const supabase = await createClient()
  const params = await searchParams
  const propertyId = params.property_id || null

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Properties (sempre carregar para o seletor)
  const { data: allProperties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  // Builders explícitos — todos com is_active=true AND lost_reason IS NULL
  // para seguir o mesmo critério do Pipeline e Dashboard (uniformidade)
  const totalQ = supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true).is("lost_reason", null)
  const todayQ = supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true).is("lost_reason", null).gte("created_at", todayStart.toISOString())
  const weekQ  = supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true).is("lost_reason", null).gte("created_at", weekStart.toISOString())
  const monthQ = supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true).is("lost_reason", null).gte("created_at", monthStart.toISOString())
  const lpYardenQ = supabase.from("leads").select("id", { count: "exact", head: true })
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", monthStart.toISOString())
    .ilike("utm_campaign", "%LP Yarden%")
  const lpVindQ = supabase.from("leads").select("id", { count: "exact", head: true })
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", monthStart.toISOString())
    .or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%")

  const [
    { count: totalLeads },
    { count: leadsToday },
    { count: leadsWeek },
    { count: leadsMonth },
    { count: lpYardenCount },
    { count: lpVindCount },
  ] = await Promise.all([
    propertyId ? totalQ.eq("property_interest_id", propertyId) : totalQ,
    propertyId ? todayQ.eq("property_interest_id", propertyId) : todayQ,
    propertyId ? weekQ.eq("property_interest_id", propertyId) : weekQ,
    propertyId ? monthQ.eq("property_interest_id", propertyId) : monthQ,
    propertyId ? lpYardenQ.eq("property_interest_id", propertyId) : lpYardenQ,
    propertyId ? lpVindQ.eq("property_interest_id", propertyId) : lpVindQ,
  ])

  // Quando filtra por empreendimento, faz queries diretas em vez de usar RPC
  let stages: { id: string; name: string; slug: string; color: string; position: number; count: number }[] = []
  let properties: { id: string; name: string; count: number }[] = []
  let brokers: { id: string; name: string; count: number; avgScore: number }[] = []
  const sourceCounts: Record<string, number> = {}
  const lostReasons: Record<string, number> = {}

  if (!propertyId) {
    // SEM filtro — usa RPC
    const { data: analytics, error: analyticsError } = await supabase.rpc("get_analytics_summary", {
      p_org_id: appUser.orgId,
      p_since: monthStart.toISOString(),
    })
    if (analyticsError) console.error("[ANALYTICS] get_analytics_summary RPC failed", analyticsError)
    const summary = (analytics as AnalyticsSummary | null) ?? null

    stages = (summary?.funnel ?? []).map((s) => ({
      id: s.stage_id, name: s.name, slug: s.slug, color: s.color, position: s.position, count: toCount(s.count),
    }))
    properties = (summary?.by_property ?? []).map((p) => ({ id: p.property_id, name: p.name, count: toCount(p.count) }))
    brokers = (summary?.by_broker ?? [])
      .filter((b) => !HIDDEN_BROKER_NAMES.has((b.name ?? "").toLowerCase().trim()))
      .map((b) => ({ id: b.user_id, name: b.name, count: toCount(b.count), avgScore: b.avg_score ?? 0 }))
    for (const [k, v] of Object.entries(summary?.source_counts ?? {})) sourceCounts[k] = toCount(v)
    for (const [k, v] of Object.entries(summary?.lost_reasons ?? {})) lostReasons[k] = toCount(v)
  } else {
    // COM filtro — queries diretas
    const [stagesData, leadsForAggData] = await Promise.all([
      supabase.from("kanban_stages").select("id, name, slug, color, position").order("position"),
      supabase
        .from("leads")
        .select("stage_id, assigned_broker_id, source, lost_reason, broker:users!assigned_broker_id(id, name)")
        .eq("org_id", appUser.orgId)
        .eq("is_active", true)
        .is("lost_reason", null)
        .eq("property_interest_id", propertyId),
    ])

    // Sources do mês (separado por período)
    const monthSourcesData = await supabase
      .from("leads")
      .select("source")
      .eq("org_id", appUser.orgId)
      .eq("is_active", true)
      .is("lost_reason", null)
      .eq("property_interest_id", propertyId)
      .gte("created_at", monthStart.toISOString())

    const allLeads = (leadsForAggData.data ?? []) as Array<{
      stage_id: string | null
      assigned_broker_id: string | null
      source: string | null
      lost_reason: string | null
      broker: { id: string; name: string } | { id: string; name: string }[] | null
    }>

    // Funnel
    const stageMap = new Map<string, number>()
    for (const l of allLeads) { if (l.stage_id) stageMap.set(l.stage_id, (stageMap.get(l.stage_id) ?? 0) + 1) }
    stages = (stagesData.data ?? []).map((s) => ({
      id: s.id, name: s.name, slug: s.slug, color: s.color, position: s.position, count: stageMap.get(s.id) ?? 0,
    }))

    // Brokers
    const brokerAgg = new Map<string, { name: string; count: number }>()
    for (const l of allLeads) {
      if (!l.assigned_broker_id) continue
      const b = Array.isArray(l.broker) ? l.broker[0] : l.broker
      if (!b?.name) continue
      if (HIDDEN_BROKER_NAMES.has(b.name.toLowerCase().trim())) continue
      const cur = brokerAgg.get(l.assigned_broker_id) ?? { name: b.name, count: 0 }
      cur.count++
      brokerAgg.set(l.assigned_broker_id, cur)
    }
    brokers = Array.from(brokerAgg.entries()).map(([id, v]) => ({ id, name: v.name, count: v.count, avgScore: 0 }))

    // Sources (do mês)
    for (const l of (monthSourcesData.data ?? []) as { source: string | null }[]) {
      const k = l.source ?? "other"
      sourceCounts[k] = (sourceCounts[k] ?? 0) + 1
    }

    // Lost reasons (todos perdidos do empreendimento)
    for (const l of allLeads) {
      if (l.lost_reason) {
        lostReasons[l.lost_reason] = (lostReasons[l.lost_reason] ?? 0) + 1
      }
    }
  }

  // by_property aparece em "Leads por Empreendimento" — sempre mostra ambos sem filtrar
  if (propertyId) {
    // Carrega counts diretamente
    const counts = await Promise.all((allProperties ?? []).map(async (p) => {
      const { count } = await supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("is_active", true)
        .eq("property_interest_id", p.id)
      return { id: p.id, name: p.name, count: count ?? 0 }
    }))
    properties = counts
  }

  // Landing Pages: extrai do utm_campaign e subtrai do "other"
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

  const sourceLabels = SOURCE_LABELS_SHORT
  // Escala raiz quadrada para diferenciar valores pequenos sem esmagar os grandes
  const maxFunnelSqrt = Math.max(...stages.map((s) => Math.sqrt(s.count)), 1)

  const selectedPropertyName = propertyId
    ? (allProperties ?? []).find((p) => p.id === propertyId)?.name ?? "Empreendimento"
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            Analytics{selectedPropertyName && (
              <span className="ml-2 text-base font-normal text-orange-600 dark:text-orange-300">
                · {selectedPropertyName}
              </span>
            )}
          </h1>
          <a
            href="/dashboard/analytics/report"
            className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Relatório PDF
          </a>
        </div>
        {/* Seletor de empreendimento */}
        <ScrollableX>
        <div className="flex items-center gap-1 rounded-md bg-stone-100 p-1 dark:bg-stone-800 min-w-max">
          <a
            href="/dashboard/analytics"
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              !propertyId
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            Todos
          </a>
          {(allProperties ?? []).map((p) => (
            <a
              key={p.id}
              href={`/dashboard/analytics?property_id=${p.id}`}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                propertyId === p.id
                  ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                  : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              {p.name}
            </a>
          ))}
        </div>
        </ScrollableX>
      </div>

      {/* Leads por Período — gráfico interativo com filtros (AC3-AC7) */}
      <LeadsChart
        properties={(allProperties ?? []).map((p) => ({ id: p.id, name: p.name }))}
        initialPropertyId={propertyId ?? undefined}
      />

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
          {stages.map((stage) => {
            const widthPct = stage.count > 0
              ? Math.max((Math.sqrt(stage.count) / maxFunnelSqrt) * 100, 4)
              : 0
            return (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-gray-600 dark:text-stone-300">{stage.name}</span>
                <div className="flex-1 min-w-0">
                  <div className="relative h-7 rounded bg-stone-100 dark:bg-stone-800/60">
                    {stage.count > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 rounded transition-all"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: stage.color,
                          opacity: 0.85,
                        }}
                      />
                    )}
                  </div>
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums dark:text-stone-100">{stage.count}</span>
              </div>
            )
          })}
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
