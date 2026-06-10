import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AnalyticsReportData, WeekComparisonGroup } from "@web/lib/pdf/analytics-report-pdf"
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
  orgId: string
): Promise<AnalyticsReportData> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  // IDs dos corretores ativos
  const { data: activeBrokersData } = await supabase
    .from("brokers")
    .select("user_id")
    .eq("org_id", orgId)
  const activeBrokerIds = new Set((activeBrokersData ?? []).map(b => b.user_id as string))

  const [
    { count: totalLeads },
    { count: leadsToday },
    { count: leadsWeek },
    { count: leadsMonth },
    { data: analytics },
    { count: lpYardenCount },
    { count: lpVindCount },
    { data: recentLeadsRaw },
    { data: propertiesRaw },
    { data: responseLeadsRaw },
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true).eq("org_id", orgId),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", todayStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", weekStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart.toISOString()),
    supabase.rpc("get_analytics_summary", { p_org_id: orgId, p_since: monthStart.toISOString() }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart.toISOString()).ilike("utm_campaign", "%LP Yarden%"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", monthStart.toISOString()).or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%"),
    supabase.from("leads")
      .select("created_at, property_interest_id, assigned_broker_id, source, broker:users!assigned_broker_id(id, name)")
      .eq("org_id", orgId)
      .gte("created_at", twoWeeksAgo.toISOString())
      .order("created_at"),
    supabase.from("properties").select("id, name").eq("is_active", true),
    // Para cálculo de tempo de atendimento: leads dos últimos 7 dias com broker
    supabase.from("leads")
      .select("id, created_at, assigned_broker_id, broker:users!assigned_broker_id(id, name)")
      .eq("org_id", orgId)
      .not("assigned_broker_id", "is", null)
      .gte("created_at", oneWeekAgo.toISOString())
      .limit(500),
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

  // ── Tempo médio de 1º atendimento por corretor ───────────────────────────
  type ResponseLead = { id: string; created_at: string; assigned_broker_id: string | null; broker: { id: string; name: string } | { id: string; name: string }[] | null }
  const responseLeads = (responseLeadsRaw ?? []) as ResponseLead[]
  const leadIds = responseLeads.map(l => l.id)

  let brokerResponseTimes: { name: string; avgMinutes: number; count: number }[] = []

  if (leadIds.length > 0) {
    const { data: firstNotes } = await supabase
      .from("activities")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("type", "broker_note")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true })

    // First note per lead
    const firstNoteByLead = new Map<string, string>()
    for (const note of (firstNotes ?? [])) {
      if (!firstNoteByLead.has(note.lead_id as string)) {
        firstNoteByLead.set(note.lead_id as string, note.created_at as string)
      }
    }

    // Group by broker and calculate avg
    const brokerMap = new Map<string, { name: string; totalMinutes: number; count: number }>()
    for (const lead of responseLeads) {
      const firstNote = firstNoteByLead.get(lead.id)
      if (!firstNote) continue
      const bArr = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker
      if (!bArr) continue
      const bName = bArr.name
      if (HIDDEN_BROKERS.has(bName.toLowerCase().trim())) continue
      const diffMs = new Date(firstNote).getTime() - new Date(lead.created_at).getTime()
      if (diffMs < 0) continue
      const diffMin = diffMs / 60000
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
  const currLeads = allRecent.filter((l) => new Date(l.created_at) >= oneWeekAgo)
  const prevLeads = allRecent.filter((l) => new Date(l.created_at) < oneWeekAgo)

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

  const weekEnd = new Date(oneWeekAgo)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" })

  const weekRange = `${fmtDate(oneWeekAgo)} – ${fmtDate(now)}`

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
    brokerResponseTimes,
    comparison,
  }
}
