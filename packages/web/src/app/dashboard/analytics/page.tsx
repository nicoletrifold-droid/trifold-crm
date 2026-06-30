import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { getOrgSchedule, businessMinutesBetweenSchedule } from "@web/lib/roleta/business-time"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import { LeadsChart } from "@web/components/analytics/leads-chart"
import { AnalyticsPeriodSelector } from "@web/components/analytics/analytics-period-selector"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import { resolvePeriod } from "@web/lib/analytics/period"

// Story 30.1 / 75-31: shape do retorno da RPC get_analytics_summary_ranged.
type AnalyticsFunnelEntry = {
  stage_id: string
  name: string
  slug: string
  color: string
  position: number
  count: number | string
}
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

const toCount = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

const HIDDEN_BROKER_NAMES = new Set(["corretor demo", "target editado"])

const RANGE_LABEL: Record<string, string> = {
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  "90d": "últimos 90 dias",
  custom: "período selecionado",
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; range?: string; from?: string; to?: string }>
}) {
  const appUser = await getServerUser()
  const supabase = await createClient()
  const params = await searchParams
  const propertyId = params.property_id || null

  // Período global (Story 75-31) — aplica à página inteira.
  const period = resolvePeriod(params.range, params.from, params.to)
  const sinceISO = period.sinceISO
  const untilISO = period.untilISO
  const rangeLabel = RANGE_LABEL[period.range] ?? "período"

  // Properties (sempre carregar para o seletor)
  const { data: allProperties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  // IDs dos corretores ATIVOS (disponíveis na roleta) — Story 75-53. Antes a query
  // pegava todos, então corretores indisponíveis (ex.: desligados) apareciam nos cards.
  const { data: activeBrokersData } = await supabase
    .from("brokers")
    .select("user_id")
    .eq("org_id", appUser.orgId)
    .eq("is_available", true)
  const activeBrokerIds = new Set((activeBrokersData ?? []).map((b) => b.user_id as string))

  // Landing Pages do período (extraídas do utm_campaign e subtraídas do "other")
  const lpYardenQ = supabase
    .from("leads").select("id", { count: "exact", head: true })
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .ilike("utm_campaign", "%LP Yarden%")
  const lpVindQ = supabase
    .from("leads").select("id", { count: "exact", head: true })
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%")

  const [{ count: lpYardenCount }, { count: lpVindCount }] = await Promise.all([
    propertyId ? lpYardenQ.eq("property_interest_id", propertyId) : lpYardenQ,
    propertyId ? lpVindQ.eq("property_interest_id", propertyId) : lpVindQ,
  ])

  let stages: { id: string; name: string; slug: string; color: string; position: number; count: number }[] = []
  let properties: { id: string; name: string; count: number }[] = []
  let brokers: { id: string; name: string; count: number; avgScore: number }[] = []
  const sourceCounts: Record<string, number> = {}
  const lostReasons: Record<string, number> = {}

  if (!propertyId) {
    // SEM filtro de empreendimento — usa o RPC período-aware
    const { data: analytics, error: analyticsError } = await supabase.rpc("get_analytics_summary_ranged", {
      p_org_id: appUser.orgId,
      p_since: sinceISO,
      p_until: untilISO,
    })
    if (analyticsError) console.error("[ANALYTICS] get_analytics_summary_ranged RPC failed", analyticsError)
    const summary = (analytics as AnalyticsSummary | null) ?? null

    stages = (summary?.funnel ?? []).map((s) => ({
      id: s.stage_id, name: s.name, slug: s.slug, color: s.color, position: s.position, count: toCount(s.count),
    }))
    properties = (summary?.by_property ?? []).map((p) => ({ id: p.property_id, name: p.name, count: toCount(p.count) }))
    brokers = (summary?.by_broker ?? [])
      .filter((b) => !HIDDEN_BROKER_NAMES.has((b.name ?? "").toLowerCase().trim()) && activeBrokerIds.has(b.user_id))
      .map((b) => ({ id: b.user_id, name: b.name, count: toCount(b.count), avgScore: b.avg_score ?? 0 }))
    for (const [k, v] of Object.entries(summary?.source_counts ?? {})) sourceCounts[k] = toCount(v)
    for (const [k, v] of Object.entries(summary?.lost_reasons ?? {})) lostReasons[k] = toCount(v)
  } else {
    // COM filtro de empreendimento — queries diretas, limitadas ao período
    const [stagesData, leadsForAggData] = await Promise.all([
      supabase.from("kanban_stages").select("id, name, slug, color, position").order("position"),
      supabase
        .from("leads")
        .select("stage_id, assigned_broker_id, source, lost_reason, broker:users!assigned_broker_id(id, name)")
        .eq("org_id", appUser.orgId)
        .eq("is_active", true)
        .is("lost_reason", null)
        .eq("property_interest_id", propertyId)
        .gte("created_at", sinceISO).lt("created_at", untilISO),
    ])

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
    brokers = Array.from(brokerAgg.entries())
      .filter(([id]) => activeBrokerIds.has(id))
      .map(([id, v]) => ({ id, name: v.name, count: v.count, avgScore: 0 }))

    // Sources do período
    for (const l of allLeads) {
      if (l.source) sourceCounts[l.source] = (sourceCounts[l.source] ?? 0) + 1
    }

    // Lost reasons — perdidos do empreendimento no período (query separada, pois
    // allLeads exclui lost_reason)
    const lostData = await supabase
      .from("leads").select("lost_reason")
      .eq("org_id", appUser.orgId).eq("is_active", true)
      .not("lost_reason", "is", null)
      .eq("property_interest_id", propertyId)
      .gte("created_at", sinceISO).lt("created_at", untilISO)
    for (const l of (lostData.data ?? []) as { lost_reason: string | null }[]) {
      if (l.lost_reason) lostReasons[l.lost_reason] = (lostReasons[l.lost_reason] ?? 0) + 1
    }
  }

  // "Leads por Empreendimento" — sempre ambos, limitado ao período
  if (propertyId) {
    const counts = await Promise.all((allProperties ?? []).map(async (p) => {
      const { count } = await supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("is_active", true).is("lost_reason", null)
        .eq("property_interest_id", p.id)
        .gte("created_at", sinceISO).lt("created_at", untilISO)
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

  // ── Métricas do período (cards de topo) ────────────────────────────────────
  const totalLeads = stages.reduce((sum, s) => sum + s.count, 0)
  const perdidos = Object.values(lostReasons).reduce((sum, n) => sum + n, 0)
  const fechamento = stages.find((s) => /fechamento|ganho|fechado/i.test(s.name))?.count ?? 0
  const conversao = totalLeads > 0 ? Math.round((fechamento / totalLeads) * 100) : 0
  const mediaDiaria = period.days > 0 ? (totalLeads / period.days) : 0

  // ── Tempo médio de atendimento por corretor (Story 75-47) ──────────────────
  // DISTRIBUIÇÃO (corretor recebeu, lead_distribution_log) → ATENDIMENTO (saiu de
  // "Aguardando atendimento" = primeiro_atendimento_em, carimbado pelo trigger 75-45).
  // Antes media 1º broker_note − created_at (entrada→nota), que inflava com a espera
  // da roleta. Considera leads ATENDIDOS no período. Só mede desde 24/06/2026.
  const responseLeads = await supabase
    .from("leads")
    .select("id, primeiro_atendimento_em, assigned_broker_id, broker:users!assigned_broker_id(id, name)")
    .eq("org_id", appUser.orgId)
    .not("assigned_broker_id", "is", null)
    .not("primeiro_atendimento_em", "is", null)
    .gte("primeiro_atendimento_em", sinceISO).lt("primeiro_atendimento_em", untilISO)
    .limit(1000)

  type ResponseLead = { id: string; primeiro_atendimento_em: string; assigned_broker_id: string; broker: { id: string; name: string } | { id: string; name: string }[] | null }
  const responseLeadList = (responseLeads.data ?? []) as ResponseLead[]
  const responseLeadIds = responseLeadList.map((l) => l.id)

  let brokerResponseTimes: { id: string; name: string; avgMinutes: number; count: number }[] = []

  if (responseLeadIds.length > 0) {
    const { data: distLog } = await supabase
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", appUser.orgId)
      .eq("status", "distributed")
      .in("lead_id", responseLeadIds)

    const distByLead = new Map<string, number[]>()
    for (const d of (distLog ?? [])) {
      const arr = distByLead.get(d.lead_id as string) ?? []
      arr.push(new Date(d.created_at as string).getTime())
      distByLead.set(d.lead_id as string, arr)
    }

    // Story 75-60: tempo médio em HORÁRIO COMERCIAL (mesma agenda/fonte do SLA).
    const { week, timezone } = await getOrgSchedule(appUser.orgId, supabase)
    const brokerMap = new Map<string, { name: string; totalMinutes: number; count: number }>()
    for (const lead of responseLeadList) {
      const atendido = new Date(lead.primeiro_atendimento_em).getTime()
      // distribuição correspondente = a mais recente ANTES do atendimento
      const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= atendido)
      if (dists.length === 0) continue
      const bArr = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker
      if (!bArr) continue
      if (HIDDEN_BROKER_NAMES.has(bArr.name.toLowerCase().trim())) continue
      const min = businessMinutesBetweenSchedule(new Date(Math.max(...dists)), new Date(atendido), week, timezone)
      const cur = brokerMap.get(bArr.id) ?? { name: bArr.name, totalMinutes: 0, count: 0 }
      cur.totalMinutes += min
      cur.count++
      brokerMap.set(bArr.id, cur)
    }

    brokerResponseTimes = [...brokerMap.entries()]
      .filter(([id, v]) => v.count >= 1 && activeBrokerIds.has(id))
      .map(([id, v]) => ({ id, name: v.name, avgMinutes: Math.round(v.totalMinutes / v.count), count: v.count }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes)
  }

  const sourceLabels = SOURCE_LABELS_SHORT
  const maxFunnelSqrt = Math.max(...stages.map((s) => Math.sqrt(s.count)), 1)

  const selectedPropertyName = propertyId
    ? (allProperties ?? []).find((p) => p.id === propertyId)?.name ?? "Empreendimento"
    : null

  // PDF sob demanda segue o período selecionado na tela (Story 75-31).
  const reportParams = new URLSearchParams({ range: period.range })
  if (period.range === "custom" && period.from && period.to) {
    reportParams.set("from", period.from)
    reportParams.set("to", period.to)
  }
  const reportHref = `/api/analytics/report?${reportParams.toString()}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            Analytics{selectedPropertyName && (
              <span className="ml-2 text-base font-normal text-orange-600 dark:text-orange-300">· {selectedPropertyName}</span>
            )}
          </h1>
          <div className="flex items-center gap-2">
            <a href={reportHref} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              Relatório PDF
            </a>
            <a href={reportHref} download
              className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600">
              Baixar PDF
            </a>
          </div>
        </div>
        <ScrollableX>
          <div className="flex items-center gap-1 rounded-md bg-stone-100 p-1 dark:bg-stone-800 min-w-max">
            <a href={`/dashboard/analytics${period.range !== "30d" ? `?range=${period.range}` : ""}`}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${!propertyId ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"}`}>
              Todos
            </a>
            {(allProperties ?? []).map((p) => (
              <a key={p.id} href={`/dashboard/analytics?property_id=${p.id}${period.range !== "30d" ? `&range=${period.range}` : ""}`}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${propertyId === p.id ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"}`}>
                {p.name}
              </a>
            ))}
          </div>
        </ScrollableX>
      </div>

      {/* Seletor de período GLOBAL — aplica à página inteira (Story 75-31) */}
      <AnalyticsPeriodSelector />

      {/* Cards do período */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Total no período</p>
          <p className="mt-1 text-3xl font-bold dark:text-stone-100">{totalLeads}</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{rangeLabel}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Média diária</p>
          <p className="mt-1 text-3xl font-bold text-blue-600 dark:text-blue-300">{mediaDiaria.toFixed(1)}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Conversão</p>
          <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-300">{conversao}%</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{fechamento} fechados</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Perdidos</p>
          <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-300">{perdidos}</p>
        </div>
      </div>

      {/* Leads por Período — gráfico (granularidade local; período vem da URL) */}
      <LeadsChart
        properties={(allProperties ?? []).map((p) => ({ id: p.id, name: p.name }))}
        initialPropertyId={propertyId ?? undefined}
        from={sinceISO}
        to={untilISO}
      />

      {/* Funnel */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Funil de Conversão <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
        <div className="space-y-2">
          {stages.map((stage) => {
            const widthPct = stage.count > 0 ? Math.max((Math.sqrt(stage.count) / maxFunnelSqrt) * 100, 4) : 0
            return (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-gray-600 dark:text-stone-300">{stage.name}</span>
                <div className="flex-1 min-w-0">
                  <div className="relative h-7 rounded bg-stone-100 dark:bg-stone-800/60">
                    {stage.count > 0 && (
                      <div className="absolute inset-y-0 left-0 rounded transition-all" style={{ width: `${widthPct}%`, backgroundColor: stage.color, opacity: 0.85 }} />
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
                <span className="rounded-full bg-orange-100 px-3 py-0.5 text-sm font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Source */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Origem <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
          <div className="space-y-3">
            {Object.entries(sourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-stone-300">{sourceLabels[source] ?? source}</span>
                  <span className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{count}</span>
                </div>
              ))}
            {Object.keys(sourceCounts).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead no período.</p>
            )}
          </div>
        </div>

        {/* Broker Performance */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Corretor</h2>
          <div className="space-y-3">
            {brokers.map((broker) => (
              <div key={broker.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-stone-300">{broker.name}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-stone-100">{broker.count} leads</span>
              </div>
            ))}
            {brokers.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum corretor com leads no período.</p>
            )}
          </div>
        </div>

        {/* Tempo médio de 1º atendimento */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-1 text-lg font-semibold dark:text-stone-100">Tempo Médio de Atendimento</h2>
          <p className="mb-4 text-xs text-gray-400 dark:text-stone-500">Da distribuição até o atendimento (saída de “Aguardando atendimento”) — {rangeLabel}</p>
          {brokerResponseTimes.length > 0 ? (
            <div className="space-y-3">
              {brokerResponseTimes.map((b) => {
                const h = Math.floor(b.avgMinutes / 60)
                const m = b.avgMinutes % 60
                const label = h > 0 ? `${h}h ${m}min` : `${m}min`
                // Meta de SLA = 60 min (dentro da meta = verde; até 2x = laranja; acima = vermelho)
                const color = b.avgMinutes <= 60 ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : b.avgMinutes <= 120 ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                const dot = b.avgMinutes <= 60 ? "bg-green-500" : b.avgMinutes <= 120 ? "bg-orange-500" : "bg-red-500"
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm text-gray-600 dark:text-stone-300">{b.name}</span>
                      <span className="ml-2 text-xs text-gray-400 dark:text-stone-500">({b.count} leads)</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                      <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${color}`}>{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum atendimento registrado no período. (A medição começou em 24/06/2026.)</p>
          )}
        </div>

        {/* Lost Reasons */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Motivos de Perda <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
          <div className="space-y-3">
            {Object.entries(lostReasons)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-stone-300">{reason}</span>
                  <span className="rounded-full bg-red-100 px-3 py-0.5 text-sm font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{count}</span>
                </div>
              ))}
            {Object.keys(lostReasons).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead perdido no período.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
