import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrgSchedule, businessMinutesBetweenSchedule } from "@web/lib/roleta/business-time"
import type { AnalyticsReportData, WeekComparisonGroup } from "@web/lib/pdf/analytics-report-pdf"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
// Story 75-271 — o relatório passa a respeitar os filtros da tela. Mesmo módulo
// de filtros da página (75-270) e mesma soma em JS que ela faz no ramo filtrado.
import { applyLeadFilters, hasAnyFilter, activeFilterKeys, EMPTY_FILTERS, FILTER_SPEC, type AnalyticsFilters } from "@web/lib/analytics/filters"
import { aggregateFilteredLeads, type AggregableLead } from "@web/lib/analytics/aggregate-filtered"
// Story 75-273 — paginação do PostgREST (helper da 75-269).
import { fetchAllLeads, type RangeableQuery } from "@web/lib/analytics/fetch-all-leads"

/** Linha da base de ativos usada pelo agregador (Story 75-273). */
type AggLeadRow = AggregableLead
import type { ResolvedPeriod } from "@web/lib/analytics/period"
// Story 75-179: tipo da RPC + derivação de métricas centralizados (dedup tela/PDF).
import { type AnalyticsSummary, deriveAnalyticsMetrics } from "@web/lib/analytics/metrics"

type RawLead = {
  created_at: string
  property_interest_id: string | null
  assigned_broker_id: string | null
  source: string | null
  broker: { id: string; name: string } | { id: string; name: string }[] | null
}

const toN = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

const HIDDEN_BROKERS = new Set(["corretor demo", "target editado"])

function brokerName(lead: RawLead): string | null {
  if (!lead.broker) return null
  const b = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker
  return b?.name ?? null
}

function buildComparison(
  currLeads: RawLead[],
  prevLeads: RawLead[],
  propNames: Map<string, string>
): WeekComparisonGroup[] {
  // ── Total ────────────────────────────────────────────────────────────────
  const groups: WeekComparisonGroup[] = [
    {
      title: "Total",
      items: [{ label: "Novos leads", current: currLeads.length, previous: prevLeads.length }],
    },
  ]

  // ── Por empreendimento ───────────────────────────────────────────────────
  const propCurr = new Map<string, number>()
  const propPrev = new Map<string, number>()
  // Story 75-179: leads sem property_interest_id sumiam do detalhamento (soma < total).
  let semEmpCurr = 0
  let semEmpPrev = 0
  for (const l of currLeads) {
    if (l.property_interest_id) propCurr.set(l.property_interest_id, (propCurr.get(l.property_interest_id) ?? 0) + 1)
    else semEmpCurr++
  }
  for (const l of prevLeads) {
    if (l.property_interest_id) propPrev.set(l.property_interest_id, (propPrev.get(l.property_interest_id) ?? 0) + 1)
    else semEmpPrev++
  }

  const propIds = new Set([...propCurr.keys(), ...propPrev.keys()])
  const propItems = [...propIds]
    .map((id) => ({
      label: propNames.get(id) ?? id,
      current: propCurr.get(id) ?? 0,
      previous: propPrev.get(id) ?? 0,
    }))
    .sort((a, b) => b.current - a.current)

  // "Sem empreendimento" fica por último — fecha o total do comparativo (75-179).
  if (semEmpCurr > 0 || semEmpPrev > 0) {
    propItems.push({ label: "Sem empreendimento", current: semEmpCurr, previous: semEmpPrev })
  }

  if (propItems.length > 0) groups.push({ title: "Por Empreendimento", items: propItems })

  // ── Por corretor ─────────────────────────────────────────────────────────
  const brokerCurr = new Map<string, { name: string; count: number }>()
  const brokerPrev = new Map<string, { name: string; count: number }>()
  // Story 75-180: leads sem corretor atribuído (comum entre entradas/perdidos) — linha
  // "Sem corretor" p/ o detalhamento fechar o total, análogo a "Sem empreendimento".
  let semCorretorCurr = 0
  let semCorretorPrev = 0

  for (const l of currLeads) {
    if (!l.assigned_broker_id) { semCorretorCurr++; continue }
    const name = brokerName(l)
    if (!name || HIDDEN_BROKERS.has(name.toLowerCase().trim())) continue
    const cur = brokerCurr.get(l.assigned_broker_id) ?? { name, count: 0 }
    cur.count++
    brokerCurr.set(l.assigned_broker_id, cur)
  }
  for (const l of prevLeads) {
    if (!l.assigned_broker_id) { semCorretorPrev++; continue }
    const name = brokerName(l)
    if (!name || HIDDEN_BROKERS.has(name.toLowerCase().trim())) continue
    const cur = brokerPrev.get(l.assigned_broker_id) ?? { name, count: 0 }
    cur.count++
    brokerPrev.set(l.assigned_broker_id, cur)
  }

  const brokerIds = new Set([...brokerCurr.keys(), ...brokerPrev.keys()])
  const brokerItems = [...brokerIds]
    .map((id) => ({
      label: brokerCurr.get(id)?.name ?? brokerPrev.get(id)?.name ?? id,
      current: brokerCurr.get(id)?.count ?? 0,
      previous: brokerPrev.get(id)?.count ?? 0,
    }))
    .sort((a, b) => b.current - a.current)

  // "Sem corretor" fica por último — fecha o total do comparativo (75-180).
  if (semCorretorCurr > 0 || semCorretorPrev > 0) {
    brokerItems.push({ label: "Sem corretor", current: semCorretorCurr, previous: semCorretorPrev })
  }

  if (brokerItems.length > 0) groups.push({ title: "Por Corretor", items: brokerItems })

  // ── Por origem ───────────────────────────────────────────────────────────
  const srcCurr: Record<string, number> = {}
  const srcPrev: Record<string, number> = {}
  for (const l of currLeads) { const k = l.source ?? "other"; srcCurr[k] = (srcCurr[k] ?? 0) + 1 }
  for (const l of prevLeads) { const k = l.source ?? "other"; srcPrev[k] = (srcPrev[k] ?? 0) + 1 }

  const srcKeys = new Set([...Object.keys(srcCurr), ...Object.keys(srcPrev)])
  const srcItems = [...srcKeys]
    .map((k) => ({
      label: SOURCE_LABELS_SHORT[k] ?? k,
      current: srcCurr[k] ?? 0,
      previous: srcPrev[k] ?? 0,
    }))
    .sort((a, b) => b.current - a.current)

  if (srcItems.length > 0) groups.push({ title: "Por Origem", items: srcItems })

  return groups
}

export async function buildAnalyticsReportData(
  supabase: SupabaseClient,
  orgId: string,
  /**
   * Período do relatório (Story 75-31 / 75-69). O relatório SEMPRE reflete
   * [since, until] e compara com o período anterior de mesma duração. O cron
   * semanal passa `resolvePeriod("7d")`; o PDF sob demanda passa o período
   * selecionado na tela. (Caminho único — não há mais "resumo semanal" fixo.)
   */
  period: ResolvedPeriod,
  /**
   * Story 75-271 — filtros ativos na tela (corretor, calor, perfil,
   * empreendimento). Default SEM filtro mantém o cron semanal intocado: ele
   * chama sem este argumento e segue no caminho da RPC, byte a byte igual.
   */
  filters: AnalyticsFilters = EMPTY_FILTERS
): Promise<AnalyticsReportData> {
  const now = new Date()

  // ── Janela do relatório ────────────────────────────────────────────────────
  // [since, until] + período anterior de mesma duração para o comparativo.
  const periodSince = new Date(period.sinceISO)
  const periodUntil = new Date(period.untilISO)
  const durationMs = periodUntil.getTime() - periodSince.getTime()
  const aggSince = periodSince
  const aggUntil = periodUntil
  const compCurrStart = periodSince
  const compPrevStart = new Date(periodSince.getTime() - durationMs)

  // IDs dos corretores ATIVOS (disponíveis na roleta) — Story 75-53 (consistente com a tela).
  const { data: activeBrokersData } = await supabase
    .from("brokers")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("is_available", true)
  const activeBrokerIds = new Set((activeBrokersData ?? []).map(b => b.user_id as string))

  const [
    { data: analytics },
    { data: analyticsPrev },
    { count: lpYardenCount },
    { count: lpVindCount },
    { data: recentLeadsRaw },
    { data: propertiesRaw },
    { data: responseLeadsRaw },
  ] = await Promise.all([
    supabase.rpc("get_analytics_summary_ranged", { p_org_id: orgId, p_since: aggSince.toISOString(), p_until: aggUntil.toISOString() }),
    // Story 75-179: período anterior (mesma duração) p/ a variação de Entradas do card herói.
    supabase.rpc("get_analytics_summary_ranged", { p_org_id: orgId, p_since: compPrevStart.toISOString(), p_until: compCurrStart.toISOString() }),
    applyLeadFilters(supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("segmento", "principal").gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString()).ilike("utm_campaign", "%LP Yarden%"), filters),
    applyLeadFilters(supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("segmento", "principal").gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString()).or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%"), filters),
    // Story 75-180: comparativo na base ENTRADAS — TODAS as entradas da janela
    // (sem filtro is_active/lost_reason), para o Total bater com o card Entradas.
    applyLeadFilters(
      supabase.from("leads")
        .select("created_at, property_interest_id, assigned_broker_id, source, broker:users!assigned_broker_id(id, name)")
        .eq("org_id", orgId)
        .eq("segmento", "principal") // Story 75-98
        .gte("created_at", compPrevStart.toISOString()).lt("created_at", aggUntil.toISOString())
        .order("created_at"),
      filters
    ),
    supabase.from("properties").select("id, name").eq("is_active", true),
    // Tempo de atendimento (Story 75-51): leads ATENDIDOS no período. Mede
    // distribuição → atendimento (primeiro_atendimento_em), igual à tela (75-47).
    // Só mede desde 24/06/2026.
    applyLeadFilters(
      supabase.from("leads")
        .select("id, primeiro_atendimento_em, assigned_broker_id, broker:users!assigned_broker_id(id, name)")
        .eq("org_id", orgId).eq("segmento", "principal").not("assigned_broker_id", "is", null).not("primeiro_atendimento_em", "is", null)
        .gte("primeiro_atendimento_em", compCurrStart.toISOString()).lt("primeiro_atendimento_em", aggUntil.toISOString())
        .limit(1000),
      filters
    ),
  ])

  const summary = (analytics as AnalyticsSummary | null) ?? null
  // Story 75-179: métricas de topo via helper único (mesma fonte da tela).
  const metrics = deriveAnalyticsMetrics(summary)
  const prevMetrics = deriveAnalyticsMetrics((analyticsPrev as AnalyticsSummary | null) ?? null)

  // ── Story 75-271 — com filtro, a soma NÃO pode vir da RPC ─────────────────
  // `get_analytics_summary_ranged` aceita só org + datas. Enquanto o PDF tirava
  // TUDO dela, ele ignorava os filtros da tela (inclusive o de empreendimento,
  // que já existia). Com filtro ativo, buscamos os leads filtrados e somamos com
  // o MESMO agregador que a tela usa — se cada um somasse do seu jeito, o dia em
  // que divergissem passaria em branco, porque PDF se confere menos que tela.
  const filtrado = hasAnyFilter(filters)

  let stages: { name: string; color: string; count: number }[]
  let properties: { name: string; count: number }[]
  let brokers: { name: string; count: number }[]
  let sourceCounts: Record<string, number> = {}
  let entradasFiltradas: number | null = null
  let prevEntradasFiltradas: number | null = null
  let perdidosFiltrados: number | null = null

  if (!filtrado) {
    stages = (summary?.funnel ?? []).map((st) => ({
      name: st.name,
      color: st.color,
      count: toN(st.count),
    }))

    properties = (summary?.by_property ?? []).map((p) => ({
      name: p.name,
      count: toN(p.count),
    }))

    brokers = (summary?.by_broker ?? [])
      .filter((b) => !HIDDEN_BROKERS.has((b.name ?? "").toLowerCase().trim()) && activeBrokerIds.has(b.user_id))
      .map((b) => ({ name: b.name, count: toN(b.count) }))

    for (const [k, v] of Object.entries(summary?.source_counts ?? {})) {
      sourceCounts[k] = toN(v)
    }
  } else {
    // Base ATIVOS (mesma da tela no ramo filtrado): funil/corretores/origens
    // falam dos leads em atendimento. Entradas/Perdidos vêm de contagens
    // próprias abaixo, porque têm recorte diferente (Story 75-179).
    const [stageDefsRes, ativosRows, entradasRes, prevEntradasRes, perdidosRes] = await Promise.all([
      supabase.from("kanban_stages").select("id, name, slug, color, position").order("position"),
      // Story 75-273 (QA-003 da 75-271) — paginado. O recorte de ativos mede 612
      // em TODA a base hoje, longe do teto de 1000 do PostgREST; mas o PDF aceita
      // `range=custom` com janela arbitrária e a base cresce, e o corte do
      // PostgREST é SILENCIOSO — o funil do PDF sairia menor que o da tela sem
      // ninguém saber. Correto por construção custa uma linha.
      fetchAllLeads<AggLeadRow>(() =>
        applyLeadFilters(
          supabase.from("leads")
            .select("stage_id, assigned_broker_id, source, property_interest_id, broker:users!assigned_broker_id(id, name)")
            .eq("org_id", orgId).eq("segmento", "principal")
            .eq("is_active", true).is("lost_reason", null)
            .gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString())
            .order("created_at"),
          filters
        ) as unknown as RangeableQuery<AggLeadRow>
      ),
      applyLeadFilters(
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).eq("segmento", "principal")
          .gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString()),
        filters
      ),
      applyLeadFilters(
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).eq("segmento", "principal")
          .gte("created_at", compPrevStart.toISOString()).lt("created_at", compCurrStart.toISOString()),
        filters
      ),
      applyLeadFilters(
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).eq("segmento", "principal")
          .not("lost_reason", "is", null)
          .gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString()),
        filters
      ),
    ])

    const stageDefs = (stageDefsRes.data ?? []) as Array<{ id: string; name: string; slug: string | null; color: string | null; position: number | null }>
    const agg = aggregateFilteredLeads(
      ativosRows,
      stageDefs,
      { hiddenBrokerNames: HIDDEN_BROKERS, activeBrokerIds }
    )

    // Cor vazia é aceitável no PDF (o componente trata); o tipo exige string.
    stages = agg.stages.map((s) => ({ name: s.name, color: s.color ?? "", count: s.count }))
    brokers = agg.brokers.map((b) => ({ name: b.name, count: b.count }))
    sourceCounts = { ...agg.sourceCounts }

    const propNames = new Map(((propertiesRaw ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]))
    properties = Object.entries(agg.byProperty)
      .map(([id, count]) => ({ name: propNames.get(id) ?? "Outro", count }))
      .sort((a, b) => b.count - a.count)

    entradasFiltradas = entradasRes.count ?? 0
    prevEntradasFiltradas = prevEntradasRes.count ?? 0
    perdidosFiltrados = perdidosRes.count ?? 0
    // Nota: o PDF não tem card de conversão — a etapa de fechamento já aparece
    // no funil (`stages`), então não há número extra a calcular aqui.
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

  // ── Tempo médio de atendimento por corretor (Story 75-51) ────────────────
  // DISTRIBUIÇÃO → ATENDIMENTO (primeiro_atendimento_em), igual à tela (75-47).
  type ResponseLead = { id: string; primeiro_atendimento_em: string; assigned_broker_id: string | null; broker: { id: string; name: string } | { id: string; name: string }[] | null }
  const responseLeads = (responseLeadsRaw ?? []) as ResponseLead[]
  const leadIds = responseLeads.map(l => l.id)

  let brokerResponseTimes: { name: string; avgMinutes: number; count: number }[] = []

  if (leadIds.length > 0) {
    const { data: distLog } = await supabase
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "distributed")
      .in("lead_id", leadIds)

    const distByLead = new Map<string, number[]>()
    for (const d of (distLog ?? [])) {
      const arr = distByLead.get(d.lead_id as string) ?? []
      arr.push(new Date(d.created_at as string).getTime())
      distByLead.set(d.lead_id as string, arr)
    }

    // Group by broker and calculate avg (distribuição mais recente antes do atendimento)
    // Story 75-60: tempo médio em HORÁRIO COMERCIAL (mesma agenda/fonte do SLA e da tela).
    const { week, timezone } = await getOrgSchedule(orgId, supabase)
    const brokerMap = new Map<string, { name: string; totalMinutes: number; count: number }>()
    for (const lead of responseLeads) {
      const atendido = new Date(lead.primeiro_atendimento_em).getTime()
      const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= atendido)
      if (dists.length === 0) continue
      const bArr = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker
      if (!bArr) continue
      const bName = bArr.name
      if (HIDDEN_BROKERS.has(bName.toLowerCase().trim())) continue
      const diffMin = businessMinutesBetweenSchedule(new Date(Math.max(...dists)), new Date(atendido), week, timezone)
      const cur = brokerMap.get(bArr.id) ?? { name: bName, totalMinutes: 0, count: 0 }
      cur.totalMinutes += diffMin
      cur.count++
      brokerMap.set(bArr.id, cur)
    }

    brokerResponseTimes = [...brokerMap.entries()]
      .filter(([id, b]) => b.count >= 1 && activeBrokerIds.has(id))
      .map(([, b]) => ({ name: b.name, avgMinutes: Math.round(b.totalMinutes / b.count), count: b.count }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes)
  }

  // ── Week-over-week comparison ─────────────────────────────────────────────
  const propNames = new Map((propertiesRaw ?? []).map((p) => [p.id, p.name]))

  const allRecent = (recentLeadsRaw ?? []) as RawLead[]
  const currLeads = allRecent.filter((l) => new Date(l.created_at) >= compCurrStart)
  const prevLeads = allRecent.filter((l) => new Date(l.created_at) < compCurrStart)

  const comparison = buildComparison(currLeads, prevLeads, propNames)

  // ── Date labels ───────────────────────────────────────────────────────────
  const generatedAt = now.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" })

  const periodRange = `${fmtDate(compCurrStart)} – ${fmtDate(aggUntil)}`
  const rangeLabel =
    period.range === "7d" ? "Últimos 7 dias"
      : period.range === "30d" ? "Últimos 30 dias"
        : period.range === "90d" ? "Últimos 90 dias"
          : "Período"

  // ── Métricas dos cards do PDF (Story 75-179: fonte única = deriveAnalyticsMetrics) ──
  // Story 75-271 — com filtro, cada número vem da contagem filtrada
  // correspondente; sem filtro, do helper da RPC, exatamente como antes.
  // `ativos` é o total agregado da base de ativos (a mesma que alimentou o funil),
  // então bate com a soma do funil por construção.
  const entradas = entradasFiltradas ?? metrics.entradas
  const ativos = filtrado ? stages.reduce((sum, st) => sum + st.count, 0) : metrics.ativos
  const perdidos = perdidosFiltrados ?? metrics.perdidos
  const entradasDelta = entradas - (prevEntradasFiltradas ?? prevMetrics.entradas)

  // Card 1: leads atualmente NA ETAPA "Visitou" (do funil ranged). Story 75-71.
  const visitou = stages.find((st) => /visitou/i.test(st.name))?.count ?? 0

  // Card 2: VISITAS REALIZADAS no período — agendamentos (appointments) com
  // scheduled_at na janela e status ≠ cancelado/no-show ("visita que aconteceu",
  // independente de quando o lead entrou). Story 75-71.
  // Story 75-271 — appointments NÃO tem as colunas dos filtros (corretor/calor/
  // perfil vivem em `leads`), então este card não é filtrável sem um join que a
  // tela também não faz. Para não exibir número que ignora o filtro ao lado de
  // números que o respeitam, com filtro ativo o card é OMITIDO (null) e o PDF
  // mostra "—". Ver `fechamentoFiltrado` para o mesmo princípio aplicado ao
  // contrário: lá havia como calcular, e foi calculado.
  let visitasRealizadas: number | null = null
  if (!filtrado) {
    const { count: visitasCount } = await supabase
      .from("appointments").select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("scheduled_at", aggSince.toISOString()).lt("scheduled_at", aggUntil.toISOString())
      .not("status", "in", "(cancelled,no_show)")
    visitasRealizadas = visitasCount ?? 0
  }

  // Tempo médio agregado, ponderado pelo nº de leads de cada corretor (mesma
  // fonte da tabela por corretor). null quando não houve atendimentos no período.
  const tempoLeads = brokerResponseTimes.reduce((sum, b) => sum + b.count, 0)
  const tempoMedioMin =
    tempoLeads > 0
      ? Math.round(brokerResponseTimes.reduce((sum, b) => sum + b.avgMinutes * b.count, 0) / tempoLeads)
      : null

  // Story 75-273 (QA-004 da 75-271) — resolve o NOME de corretor e
  // empreendimento para o cabeçalho. Antes o PDF dizia só "Corretor", e quem
  // recebia sabia que havia filtro mas não de quem — relatório que anuncia o
  // recorte pela metade ainda obriga a perguntar. Uma query por dimensão, e só
  // quando ela está filtrada.
  const nomesDeFiltro = new Map<string, string>()
  await Promise.all([
    (async () => {
      if (!filters.brokerId) return
      const { data } = await supabase.from("users").select("name").eq("id", filters.brokerId).maybeSingle()
      if (data?.name) nomesDeFiltro.set(filters.brokerId!, data.name as string)
    })(),
    (async () => {
      if (!filters.propertyId) return
      const { data } = await supabase.from("properties").select("name").eq("id", filters.propertyId).maybeSingle()
      if (data?.name) nomesDeFiltro.set(filters.propertyId!, data.name as string)
    })(),
  ])

  const comparisonTitle =
    period.range === "custom"
      ? "Comparativo — período atual vs período anterior"
      : `Comparativo — últimos ${period.days} dias vs ${period.days} dias anteriores`

  return {
    generatedAt,
    periodRange,
    rangeLabel,
    // Story 75-271 — sem esta linha o PDF filtrado seria indistinguível de um
    // PDF completo, e alguém compararia dois relatórios de recortes diferentes
    // achando que são o mesmo. Filtro que não se anuncia no papel é armadilha.
    filtrosAtivos: describeActiveFilters(filters, nomesDeFiltro),
    entradas,
    entradasDelta,
    ativos,
    visitou,
    visitasRealizadas,
    perdidos,
    tempoMedioMin,
    comparisonTitle,
    currentLabel: "Atual",
    previousLabel: "Anterior",
    stages,
    properties,
    sources,
    brokers,
    brokerResponseTimes,
    comparison,
  }
}

/**
 * Story 75-271 — descreve os filtros ativos para o cabeçalho do PDF. Vazio
 * quando não há filtro (o PDF omite a linha).
 *
 * Story 75-273 — corretor e empreendimento passam a sair com o NOME (resolvido
 * por quem chama e entregue em `nomes`). Id não resolvido cai no rótulo pelado:
 * imprimir uuid num relatório que alguém vai ler é pior que não dizer.
 */
function describeActiveFilters(
  filters: AnalyticsFilters,
  nomes: Map<string, string> = new Map()
): string[] {
  const rotulos: Record<string, string> = {
    propertyId: "Empreendimento",
    brokerId: "Corretor",
    interestLevel: "Calor",
    finalidade: "Finalidade",
    profissao: "Profissão",
    rendaFamiliar: "Renda",
    filhos: "Filhos",
    estadoCivil: "Estado civil",
    faixaEtaria: "Faixa etária",
    situacaoMoradia: "Moradia",
    temPet: "Pet",
    cidadeBairro: "Cidade/Bairro",
  }
  return activeFilterKeys(filters).map((k) => {
    const valor = filters[k]
    const rotulo = rotulos[k] ?? FILTER_SPEC[k].param
    // Id (uuid) não diz nada no papel; para essas dimensões basta anunciar que
    // há filtro. Para as de valor legível, mostra o valor.
    // Id resolvido → mostra o nome. Não resolvido (corretor apagado, por ex.)
    // → anuncia só a dimensão, em vez de imprimir um uuid no relatório.
    const ehId = k === "propertyId" || k === "brokerId"
    if (ehId) {
      const nome = valor ? nomes.get(valor) : undefined
      return nome ? `${rotulo}: ${nome}` : rotulo
    }
    return `${rotulo}: ${valor}`
  })
}
