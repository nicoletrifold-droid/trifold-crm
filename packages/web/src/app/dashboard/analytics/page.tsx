import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { getOrgSchedule, businessMinutesBetweenSchedule } from "@web/lib/roleta/business-time"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import { LeadsChart } from "@web/components/analytics/leads-chart"
import { ExecutiveCharts } from "@web/components/analytics/executive-charts"
import { AnalyticsPeriodSelector } from "@web/components/analytics/analytics-period-selector"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import { resolvePeriod } from "@web/lib/analytics/period"
// Story 75-179: fonte única das métricas (tipo da RPC + derivação) — dedup tela/PDF.
// Story 75-266: idem p/ os grupos de motivo de perda (deriveLostReasonGroups).
import { type AnalyticsSummary, deriveAnalyticsMetrics, deriveLostReasonGroups, toCount } from "@web/lib/analytics/metrics"
import { aggregatePerfil, type PerfilRow } from "@web/lib/analytics/perfil"

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
    .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .ilike("utm_campaign", "%LP Yarden%")
  const lpVindQ = supabase
    .from("leads").select("id", { count: "exact", head: true })
    .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
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
  // Story 75-266: o card "Motivos de Perda" agrega por GRUPO (mig 213), não por texto cru.
  // Mesmo universo do lost_reasons da RPC → a soma continua sendo o KPI Perdidos.
  const lostGroups: Record<string, number> = {}
  let lostEstruturados = 0
  // QA-002: KPI Perdidos pelo caminho antigo, usado só se os grupos vierem vazios
  // (janela em que o deploy chega antes da mig 213).
  let perdidosFallback = 0
  // Story 75-179: Entradas (todas do período) + Ativos (subconjunto ativo/não-perdido),
  // via helper único deriveAnalyticsMetrics (mesma fonte da tela e do PDF).
  let entradas = 0
  let ativos = 0

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
    for (const [k, v] of Object.entries(summary?.lost_reason_groups ?? {})) lostGroups[k] = toCount(v)
    lostEstruturados = toCount(summary?.lost_reason_estruturados)
    const m = deriveAnalyticsMetrics(summary)
    entradas = m.entradas
    ativos = m.ativos
    perdidosFallback = m.perdidos
  } else {
    // COM filtro de empreendimento — queries diretas, limitadas ao período
    const [stagesData, leadsForAggData] = await Promise.all([
      supabase.from("kanban_stages").select("id, name, slug, color, position").order("position"),
      supabase
        .from("leads")
        .select("stage_id, assigned_broker_id, source, lost_reason, broker:users!assigned_broker_id(id, name)")
        .eq("org_id", appUser.orgId)
        .eq("segmento", "principal") // Story 75-98
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

    // Story 75-179: Ativos = criados na janela, ativos e não-perdidos (allLeads já filtra).
    ativos = allLeads.length
    // Entradas = TODOS os criados na janela p/ o empreendimento (inclui perdidos/inativos).
    const { count: entradasCount } = await supabase
      .from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", appUser.orgId).eq("segmento", "principal")
      .eq("property_interest_id", propertyId)
      .gte("created_at", sinceISO).lt("created_at", untilISO)
    entradas = entradasCount ?? 0

    // Motivos de perda por GRUPO — Story 75-266. Mesmo universo do caminho sem
    // filtro (lost_reason IS NOT NULL + janela + segmento principal, Story 75-178:
    // sem filtro is_active), agregado no banco pela mesma f_lost_reason_grupo.
    const { data: lostGroupsData, error: lostGroupsError } = await supabase.rpc("get_lost_reason_groups", {
      p_org_id: appUser.orgId,
      p_since: sinceISO,
      p_until: untilISO,
      p_property_id: propertyId,
    })
    if (lostGroupsError) {
      console.error("[ANALYTICS] get_lost_reason_groups RPC failed", lostGroupsError)
      // QA-002: RPC ausente/quebrada → KPI pelo caminho antigo (head-count do cru).
      const { count: lostCount } = await supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("segmento", "principal")
        .not("lost_reason", "is", null)
        .eq("property_interest_id", propertyId)
        .gte("created_at", sinceISO).lt("created_at", untilISO)
      perdidosFallback = lostCount ?? 0
    }
    const lg = (lostGroupsData ?? null) as { groups?: Record<string, number | string> | null; estruturados?: number | string | null } | null
    for (const [k, v] of Object.entries(lg?.groups ?? {})) lostGroups[k] = toCount(v)
    lostEstruturados = toCount(lg?.estruturados)
  }

  // "Leads por Empreendimento" — sempre ambos, limitado ao período
  if (propertyId) {
    const counts = await Promise.all((allProperties ?? []).map(async (p) => {
      const { count } = await supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("segmento", "principal").eq("is_active", true).is("lost_reason", null)
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

  // ── Perfil dos Leads (Story 75-184) ────────────────────────────────────────
  // Base ENTRADAS (todos os criados na janela, inclusive perdidos — perfil
  // demográfico independe do desfecho). Agregação pura em aggregatePerfil.
  let perfilQuery = supabase
    .from("leads")
    .select("profissao, renda_familiar, filhos, estado_civil, faixa_etaria, situacao_moradia, tem_pet")
    .eq("org_id", appUser.orgId)
    .eq("segmento", "principal")
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .limit(5000)
  if (propertyId) perfilQuery = perfilQuery.eq("property_interest_id", propertyId)
  const { data: perfilRows } = await perfilQuery
  const perfil = aggregatePerfil((perfilRows ?? []) as PerfilRow[])

  // ── Métricas do período (cards de topo) ────────────────────────────────────
  // Story 75-179: Entradas = todas as entradas; Ativos = subconjunto ativo/não-perdido.
  // Conversão e média diária usam ENTRADAS (denominador honesto).
  // Story 75-266: soma dos grupos ≡ soma do texto cru (mesmo universo no SQL) — o KPI não muda.
  // Fallback (QA-002): se a mig 213 ainda não estiver aplicada, o JSONB não tem a chave de
  // grupos — o KPI cai na soma do cru (comportamento antigo) em vez de zerar em silêncio.
  const somaGrupos = Object.values(lostGroups).reduce((sum, n) => sum + n, 0)
  const perdidos = somaGrupos > 0 ? somaGrupos : perdidosFallback
  const lostGroupEntries = deriveLostReasonGroups(lostGroups)
  const lostHeuristica = Math.max(0, perdidos - lostEstruturados)
  const fechamento = stages.find((s) => /fechamento|ganho|fechado/i.test(s.name))?.count ?? 0
  const conversao = entradas > 0 ? Math.round((fechamento / entradas) * 100) : 0
  const mediaDiaria = period.days > 0 ? (entradas / period.days) : 0

  // ── Deltas vs período anterior de mesma duração (Visão Executiva) ──────────
  // Mesmo padrão dual da página: RPC sem filtro de empreendimento, head-counts com.
  const durationMs = new Date(untilISO).getTime() - new Date(sinceISO).getTime()
  const prevSinceISO = new Date(new Date(sinceISO).getTime() - durationMs).toISOString()
  let prevEntradas = 0
  let prevPerdidos = 0
  let prevFechamento = 0

  if (!propertyId) {
    const { data: prevAnalytics } = await supabase.rpc("get_analytics_summary_ranged", {
      p_org_id: appUser.orgId,
      p_since: prevSinceISO,
      p_until: sinceISO,
    })
    const prevSummary = (prevAnalytics as AnalyticsSummary | null) ?? null
    const pm = deriveAnalyticsMetrics(prevSummary)
    prevEntradas = pm.entradas
    prevPerdidos = pm.perdidos
    prevFechamento = toCount(
      (prevSummary?.funnel ?? []).find((s) => /fechamento|ganho|fechado/i.test(s.name))?.count
    )
  } else {
    const fechadoStageIds = stages.filter((s) => /fechamento|ganho|fechado/i.test(s.name)).map((s) => s.id)
    const prevBase = () =>
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("segmento", "principal")
        .eq("property_interest_id", propertyId)
        .gte("created_at", prevSinceISO).lt("created_at", sinceISO)
    const [{ count: pe }, { count: pp }, fechadoRes] = await Promise.all([
      prevBase(),
      prevBase().not("lost_reason", "is", null),
      fechadoStageIds.length > 0 ? prevBase().in("stage_id", fechadoStageIds) : Promise.resolve({ count: 0 }),
    ])
    prevEntradas = pe ?? 0
    prevPerdidos = pp ?? 0
    prevFechamento = fechadoRes.count ?? 0
  }

  const prevConversao = prevEntradas > 0 ? Math.round((prevFechamento / prevEntradas) * 100) : 0
  const deltaPct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

  /** Badge ▲/▼ vs período anterior. `invert` = subir é ruim (perdidos). */
  const deltaBadge = (delta: number | null, opts?: { invert?: boolean; suffix?: string }) => {
    if (delta == null) return null
    const good = opts?.invert ? delta < 0 : delta > 0
    const cls = delta === 0
      ? "text-stone-400 dark:text-stone-500"
      : good
        ? "text-green-600 dark:text-green-300"
        : "text-red-600 dark:text-red-300"
    return (
      <span className={`text-xs font-semibold ${cls}`}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}{delta}{opts?.suffix ?? "%"} vs anterior
      </span>
    )
  }

  // ── Tempo médio de atendimento por corretor (Story 75-47) ──────────────────
  // DISTRIBUIÇÃO (corretor recebeu, lead_distribution_log) → ATENDIMENTO (saiu de
  // "Aguardando atendimento" = primeiro_atendimento_em, carimbado pelo trigger 75-45).
  // Antes media 1º broker_note − created_at (entrada→nota), que inflava com a espera
  // da roleta. Considera leads ATENDIDOS no período. Só mede desde 24/06/2026.
  const responseLeads = await supabase
    .from("leads")
    .select("id, primeiro_atendimento_em, assigned_broker_id, broker:users!assigned_broker_id(id, name)")
    .eq("org_id", appUser.orgId)
    .eq("segmento", "principal") // Story 75-98
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

      {/* Cards do período (Story 75-179: Entradas + Ativos + Conversão + Perdidos) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Entradas</p>
          <p className="mt-1 text-3xl font-bold dark:text-stone-100">{entradas}</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{mediaDiaria.toFixed(1)}/dia · {rangeLabel}</p>
          {deltaBadge(deltaPct(entradas, prevEntradas))}
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Ativos</p>
          <p className="mt-1 text-3xl font-bold text-blue-600 dark:text-blue-300">{ativos}</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">em atendimento</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Conversão</p>
          <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-300">{conversao}%</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{fechamento} de {entradas}</p>
          {deltaBadge(prevEntradas > 0 ? conversao - prevConversao : null, { suffix: " pp" })}
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Perdidos</p>
          <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-300">{perdidos}</p>
          {deltaBadge(deltaPct(perdidos, prevPerdidos), { invert: true })}
        </div>
      </div>

      {/* Leads por Período — gráfico (granularidade local; período vem da URL) */}
      <LeadsChart
        properties={(allProperties ?? []).map((p) => ({ id: p.id, name: p.name }))}
        initialPropertyId={propertyId ?? undefined}
        from={sinceISO}
        to={untilISO}
      />

      {/* Visão Executiva — 6 gráficos de leitura rápida (cruzamentos) */}
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold dark:text-stone-100">Visão Executiva</h2>
          <span className="text-sm text-stone-400 dark:text-stone-500">{rangeLabel}</span>
        </div>
        <ExecutiveCharts
          from={sinceISO}
          to={untilISO}
          propertyId={propertyId ?? undefined}
          rangeLabel={rangeLabel}
        />
      </div>

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

        {/* Lost Reasons — Story 75-266: grupos estruturados (75-264), não texto cru */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Motivos de Perda <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
          <div className="space-y-3">
            {lostGroupEntries.map(({ grupo, label, count }) => (
              <div key={grupo} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600 dark:text-stone-300">{label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-stone-400 dark:text-stone-500">{perdidos > 0 ? `${Math.round((count / perdidos) * 100)}%` : ""}</span>
                  <span className="rounded-full bg-red-100 px-3 py-0.5 text-sm font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{count}</span>
                </span>
              </div>
            ))}
            {lostGroupEntries.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead perdido no período.</p>
            )}
          </div>
          {perdidos > 0 && (
            <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
              {lostEstruturados} {lostEstruturados === 1 ? "motivo escolhido" : "motivos escolhidos"} na hora da perda
              {lostHeuristica > 0 && <> · {lostHeuristica} {lostHeuristica === 1 ? "classificado" : "classificados"} por heurística do texto antigo</>}
            </p>
          )}
        </div>
      </div>

      {/* Perfil dos Leads — Story 75-184 (insights p/ marketing) */}
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold dark:text-stone-100">Perfil dos Leads</h2>
          <span className="text-sm text-stone-400 dark:text-stone-500">
            {perfil.comPerfil} de {perfil.total} leads com perfil · {rangeLabel}
          </span>
        </div>
        {perfil.comPerfil === 0 ? (
          <div className="rounded-lg bg-white p-5 text-sm text-gray-400 shadow-sm dark:bg-stone-900 dark:text-stone-500 dark:ring-1 dark:ring-stone-800">
            Nenhum lead com perfil preenchido no período. Os campos são preenchidos no cadastro/edição do lead — e pela Nicole, automaticamente, quando o lead menciona na conversa.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {([
              { title: "Profissão", items: perfil.profissao, badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
              { title: "Renda familiar", items: perfil.renda, badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
              { title: "Faixa etária", items: perfil.faixaEtaria, badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
              { title: "Filhos", items: perfil.filhos, badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
              { title: "Estado civil", items: perfil.estadoCivil, badge: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300" },
              { title: "Moradia & Pet", items: [...perfil.moradia, ...perfil.pet.map((p) => ({ ...p, label: `Pet: ${p.label}` }))], badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
            ] as { title: string; items: { label: string; count: number }[]; badge: string }[]).map((card) => (
              <div key={card.title} className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
                <h3 className="mb-3 text-base font-semibold dark:text-stone-100">{card.title}</h3>
                <div className="space-y-2.5">
                  {card.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-stone-300">{item.label}</span>
                      <span className={`rounded-full px-3 py-0.5 text-sm font-medium ${card.badge}`}>{item.count}</span>
                    </div>
                  ))}
                  {card.items.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-stone-500">Sem dados no período.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
