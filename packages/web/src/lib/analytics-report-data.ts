import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrgSchedule, businessMinutesBetweenSchedule } from "@web/lib/roleta/business-time"
import type { AnalyticsReportData, WeekComparisonGroup } from "@web/lib/pdf/analytics-report-pdf"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import type { ResolvedPeriod } from "@web/lib/analytics/period"

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
  for (const l of currLeads) if (l.property_interest_id) propCurr.set(l.property_interest_id, (propCurr.get(l.property_interest_id) ?? 0) + 1)
  for (const l of prevLeads) if (l.property_interest_id) propPrev.set(l.property_interest_id, (propPrev.get(l.property_interest_id) ?? 0) + 1)

  const propIds = new Set([...propCurr.keys(), ...propPrev.keys()])
  const propItems = [...propIds]
    .map((id) => ({
      label: propNames.get(id) ?? id,
      current: propCurr.get(id) ?? 0,
      previous: propPrev.get(id) ?? 0,
    }))
    .sort((a, b) => b.current - a.current)

  if (propItems.length > 0) groups.push({ title: "Por Empreendimento", items: propItems })

  // ── Por corretor ─────────────────────────────────────────────────────────
  const brokerCurr = new Map<string, { name: string; count: number }>()
  const brokerPrev = new Map<string, { name: string; count: number }>()

  for (const l of currLeads) {
    if (!l.assigned_broker_id) continue
    const name = brokerName(l)
    if (!name || HIDDEN_BROKERS.has(name.toLowerCase().trim())) continue
    const cur = brokerCurr.get(l.assigned_broker_id) ?? { name, count: 0 }
    cur.count++
    brokerCurr.set(l.assigned_broker_id, cur)
  }
  for (const l of prevLeads) {
    if (!l.assigned_broker_id) continue
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
  period: ResolvedPeriod
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
    { count: lpYardenCount },
    { count: lpVindCount },
    { data: recentLeadsRaw },
    { data: propertiesRaw },
    { data: responseLeadsRaw },
  ] = await Promise.all([
    supabase.rpc("get_analytics_summary_ranged", { p_org_id: orgId, p_since: aggSince.toISOString(), p_until: aggUntil.toISOString() }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString()).ilike("utm_campaign", "%LP Yarden%"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString()).or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%"),
    supabase.from("leads")
      .select("created_at, property_interest_id, assigned_broker_id, source, broker:users!assigned_broker_id(id, name)")
      .eq("org_id", orgId)
      .eq("is_active", true).is("lost_reason", null)
      .gte("created_at", compPrevStart.toISOString()).lt("created_at", aggUntil.toISOString())
      .order("created_at"),
    supabase.from("properties").select("id, name").eq("is_active", true),
    // Tempo de atendimento (Story 75-51): leads ATENDIDOS no período. Mede
    // distribuição → atendimento (primeiro_atendimento_em), igual à tela (75-47).
    // Só mede desde 24/06/2026.
    supabase.from("leads")
      .select("id, primeiro_atendimento_em, assigned_broker_id, broker:users!assigned_broker_id(id, name)")
      .eq("org_id", orgId).not("assigned_broker_id", "is", null).not("primeiro_atendimento_em", "is", null)
      .gte("primeiro_atendimento_em", compCurrStart.toISOString()).lt("primeiro_atendimento_em", aggUntil.toISOString())
      .limit(1000),
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
    .filter((b) => !HIDDEN_BROKERS.has((b.name ?? "").toLowerCase().trim()) && activeBrokerIds.has(b.user_id))
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

  // ── Métricas dos cards do PDF ──────────────────────────────────────────────
  const { count: perdidosCount } = await supabase
    .from("leads").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("is_active", true)
    .not("lost_reason", "is", null)
    .gte("created_at", aggSince.toISOString()).lt("created_at", aggUntil.toISOString())
  const perdidos = perdidosCount ?? 0

  // Card 1: leads atualmente NA ETAPA "Visitou" (do funil ranged). Story 75-71.
  const visitou = stages.find((st) => /visitou/i.test(st.name))?.count ?? 0

  // Card 2: VISITAS REALIZADAS no período — agendamentos (appointments) com
  // scheduled_at na janela e status ≠ cancelado/no-show ("visita que aconteceu",
  // independente de quando o lead entrou). Story 75-71.
  const { count: visitasCount } = await supabase
    .from("appointments").select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("scheduled_at", aggSince.toISOString()).lt("scheduled_at", aggUntil.toISOString())
    .not("status", "in", "(cancelled,no_show)")
  const visitasRealizadas = visitasCount ?? 0

  // "Novos leads" e sua variação saem da linha Total do comparativo — assim o
  // card casa 1:1 com a tabela de comparação (mesma fonte/filtro).
  const totalItem = comparison.find((g) => g.title === "Total")?.items[0]
  const novosLeads = totalItem?.current ?? 0
  const novosLeadsDelta = (totalItem?.current ?? 0) - (totalItem?.previous ?? 0)

  // Tempo médio agregado, ponderado pelo nº de leads de cada corretor (mesma
  // fonte da tabela por corretor). null quando não houve atendimentos no período.
  const tempoLeads = brokerResponseTimes.reduce((sum, b) => sum + b.count, 0)
  const tempoMedioMin =
    tempoLeads > 0
      ? Math.round(brokerResponseTimes.reduce((sum, b) => sum + b.avgMinutes * b.count, 0) / tempoLeads)
      : null

  const comparisonTitle =
    period.range === "custom"
      ? "Comparativo — período atual vs período anterior"
      : `Comparativo — últimos ${period.days} dias vs ${period.days} dias anteriores`

  return {
    generatedAt,
    periodRange,
    rangeLabel,
    novosLeads,
    novosLeadsDelta,
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
