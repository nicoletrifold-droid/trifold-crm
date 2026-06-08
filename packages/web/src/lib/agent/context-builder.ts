import type { SupabaseClient } from "@supabase/supabase-js"

// ─── In-memory cache (5 min TTL) ──────────────────────────────────────────────
interface CacheEntry { text: string; ts: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000

function getCached(key: string): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null }
  return entry.text
}
function setCached(key: string, text: string) {
  cache.set(key, { text, ts: Date.now() })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number | null): string {
  return n !== null ? `${n.toFixed(1)}%` : "—"
}
function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 100)}%` : "—"
}

// ─── Global context ───────────────────────────────────────────────────────────
export async function buildGlobalContext(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  const key = `global:${orgId}`
  const cached = getCached(key)
  if (cached) return cached

  const today = new Date().toISOString().split("T")[0]!
  const date30dAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()

  const [campaignsRes, insights30dRes, alertsRes, leadsRes] = await Promise.all([
    supabase
      .from("meta_campaigns")
      .select("meta_campaign_id, name, status, daily_budget, objective")
      .eq("org_id", orgId),
    supabase
      .from("meta_insights_daily")
      .select("entity_id, spend, leads, landing_page_views, outbound_clicks")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .gte("date", date30dAgo)
      .lte("date", today),
    supabase
      .from("meta_alerts")
      .select("alert_type, level, entity_name, severity, message, fired_date")
      .eq("org_id", orgId)
      .eq("is_read", false)
      .gte("fired_date", date30dAgo)
      .order("fired_date", { ascending: false })
      .limit(20),
    supabase
      .from("leads")
      .select("id, utm_campaign, last_response_at, status, metadata")
      .eq("org_id", orgId)
      .in("source", ["meta_ads", "whatsapp_click_to_ad"]),
  ])

  const campaigns = campaignsRes.data ?? []
  const insights30d = insights30dRes.data ?? []
  const alerts = alertsRes.data ?? []
  const leads = leadsRes.data ?? []

  // Aggregate insights by campaign
  const agg = new Map<string, { spend: number; leads: number; lp: number; clicks: number }>()
  for (const row of insights30d) {
    const cur = agg.get(row.entity_id) ?? { spend: 0, leads: 0, lp: 0, clicks: 0 }
    cur.spend  += Number(row.spend ?? 0)
    cur.leads  += Number(row.leads ?? 0)
    cur.lp     += Number(row.landing_page_views ?? 0)
    cur.clicks += Number(row.outbound_clicks ?? 0)
    agg.set(row.entity_id, cur)
  }

  // Lead quality by campaign name
  const QUALIFIED = new Set(["contacted","qualified","visit_scheduled","visited","proposal","closed"])
  const leadsByCampaign = new Map<string, { total: number; responded: number; qualified: number }>()
  for (const l of leads) {
    const key = l.utm_campaign ?? ((l.metadata as Record<string,unknown>|null)?.campaign_id as string | undefined)
    if (!key) continue
    const cur = leadsByCampaign.get(key) ?? { total: 0, responded: 0, qualified: 0 }
    cur.total++
    if (l.last_response_at) {
      cur.responded++
      if (QUALIFIED.has(l.status ?? "")) cur.qualified++
    }
    leadsByCampaign.set(key, cur)
  }

  // Build lines
  const lines: string[] = []
  lines.push(`CONTEXTO META ADS — Gerado: ${today}`)
  lines.push("")

  const totalSpend  = [...agg.values()].reduce((s, v) => s + v.spend, 0)
  const totalLeads  = [...agg.values()].reduce((s, v) => s + v.leads, 0)
  const totalCrm    = [...leadsByCampaign.values()].reduce((s, v) => s + v.responded, 0)

  lines.push("=== PORTFÓLIO (30 dias) ===")
  lines.push(`Spend total: R$${fmtBRL(totalSpend)} | Leads Meta: ${totalLeads} | Leads CRM responderam: ${totalCrm}`)

  // Per-campaign table
  lines.push("")
  lines.push("=== CAMPANHAS ===")
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE")
  const otherCampaigns  = campaigns.filter((c) => c.status !== "ACTIVE")

  function renderCampaign(c: typeof campaigns[0]) {
    const ins = agg.get(c.meta_campaign_id) ?? { spend: 0, leads: 0, lp: 0, clicks: 0 }
    const crm = leadsByCampaign.get(c.name) ?? leadsByCampaign.get(c.meta_campaign_id) ?? { total: 0, responded: 0, qualified: 0 }
    const cplMeta = ins.leads > 0 ? `R$${fmtBRL(ins.spend / ins.leads)}` : "—"
    const cplReal = crm.responded > 0 ? `R$${fmtBRL(ins.spend / crm.responded)}` : "—"
    const qualif  = ins.leads > 0 ? fmtPct((crm.qualified / ins.leads) * 100) : "—"
    const budget  = c.daily_budget ? `R$${fmtBRL(c.daily_budget / 100)}/d` : "sem limite diário"
    return `[${c.status}] ${c.name} | ID:${c.meta_campaign_id} | Spend: R$${fmtBRL(ins.spend)} | Leads Meta: ${ins.leads} | CPL Meta: ${cplMeta} | CPL Real: ${cplReal} | Qualif: ${qualif} | Budget: ${budget}`
  }

  if (activeCampaigns.length > 0) {
    lines.push("-- Ativas --")
    for (const c of activeCampaigns) lines.push(renderCampaign(c))
  }
  if (otherCampaigns.length > 0) {
    lines.push("-- Pausadas/Arquivadas --")
    for (const c of otherCampaigns) lines.push(renderCampaign(c))
  }

  // Alerts
  if (alerts.length > 0) {
    lines.push("")
    lines.push("=== ALERTAS ATIVOS ===")
    for (const a of alerts) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.alert_type} (${a.fired_date}) — ${a.message}`)
    }
  }

  const text = lines.join("\n")
  setCached(key, text)
  return text
}

// ─── Campaign-specific context ────────────────────────────────────────────────
export async function buildCampaignContext(
  supabase: SupabaseClient,
  orgId: string,
  metaCampaignId: string,
): Promise<string> {
  const key = `campaign:${orgId}:${metaCampaignId}`
  const cached = getCached(key)
  if (cached) return cached

  const today = new Date().toISOString().split("T")[0]!
  const date30dAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
  const date7dAgo  = (() => { const d = new Date(); d.setDate(d.getDate() - 7);  return d.toISOString().split("T")[0]! })()

  // Fetch campaign first — need name for leads join
  const campaignRes = await supabase
    .from("meta_campaigns")
    .select("name, status, objective, daily_budget, start_time")
    .eq("meta_campaign_id", metaCampaignId)
    .eq("org_id", orgId)
    .maybeSingle()

  const campaignName = campaignRes.data?.name ?? "__none__"

  const [insightsRes, adsetInsightsRes, alertsRes, leadsRes, placementRes] = await Promise.all([
    supabase
      .from("meta_insights_daily")
      .select("date, spend, impressions, reach, clicks, ctr, cpm, frequency, leads, outbound_clicks, landing_page_views")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .eq("entity_id", metaCampaignId)
      .gte("date", date30dAgo)
      .order("date", { ascending: false }),
    supabase
      .from("meta_insights_daily")
      .select("entity_id, spend, impressions, clicks, ctr, leads, quality_ranking")
      .eq("org_id", orgId)
      .eq("level", "adset")
      .gte("date", date30dAgo)
      .order("date", { ascending: false }),
    supabase
      .from("meta_alerts")
      .select("alert_type, severity, message, fired_date")
      .eq("org_id", orgId)
      .eq("entity_id", metaCampaignId)
      .eq("is_read", false)
      .order("fired_date", { ascending: false })
      .limit(10),
    supabase
      .from("leads")
      .select("id, utm_campaign, last_response_at, status, metadata")
      .eq("org_id", orgId)
      .in("source", ["meta_ads", "whatsapp_click_to_ad"])
      .or(`utm_campaign.eq.${campaignName},metadata->>campaign_id.eq.${metaCampaignId}`),
    supabase
      .from("meta_insights_placement_daily")
      .select("publisher_platform, platform_position, spend, impressions, clicks, leads")
      .eq("org_id", orgId)
      .eq("campaign_id", metaCampaignId)
      .order("spend", { ascending: false })
      .limit(20),
  ])

  const campaign = campaignRes.data
  if (!campaign) return `Campanha ${metaCampaignId} não encontrada.`

  const insights = insightsRes.data ?? []
  const adsetInsights = adsetInsightsRes.data ?? []
  const alerts = alertsRes.data ?? []
  const leads = leadsRes.data ?? []
  const placement = placementRes.data ?? []

  // Aggregate 30d totals
  const tot30 = insights.reduce((acc, r) => ({
    spend: acc.spend + Number(r.spend ?? 0),
    impressions: acc.impressions + Number(r.impressions ?? 0),
    clicks: acc.clicks + Number(r.clicks ?? 0),
    leads: acc.leads + Number(r.leads ?? 0),
    lp: acc.lp + Number(r.landing_page_views ?? 0),
    clicks_out: acc.clicks_out + Number(r.outbound_clicks ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0, lp: 0, clicks_out: 0 })

  const avgFreq = insights.length > 0
    ? insights.reduce((s, r) => s + Number(r.frequency ?? 0), 0) / insights.length
    : 0
  const avgCtr = tot30.impressions > 0 ? (tot30.clicks / tot30.impressions) * 100 : 0
  const avgCpm = tot30.impressions > 0 ? (tot30.spend / tot30.impressions) * 1000 : 0

  // CRM funnel
  const QUALIFIED = new Set(["contacted","qualified","visit_scheduled","visited","proposal","closed"])
  const VISIT     = new Set(["visit_scheduled","visited","proposal","closed"])
  const PROPOSAL  = new Set(["proposal","closed"])
  const crmLeads    = leads.length
  const responded   = leads.filter((l) => l.last_response_at).length
  const qualified   = leads.filter((l) => l.last_response_at && QUALIFIED.has(l.status ?? "")).length
  const visits      = leads.filter((l) => VISIT.has(l.status ?? "")).length
  const proposals   = leads.filter((l) => PROPOSAL.has(l.status ?? "")).length

  const cplMeta = tot30.leads > 0 ? tot30.spend / tot30.leads : null
  const cplReal = responded > 0   ? tot30.spend / responded   : null
  const lpRate  = tot30.clicks_out > 0 ? (tot30.lp / tot30.clicks_out) * 100 : null

  // Adset aggregation
  const adsetAgg = new Map<string, { spend: number; leads: number; impressions: number; clicks: number; quality: string | null }>()
  for (const r of adsetInsights) {
    const cur = adsetAgg.get(r.entity_id) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0, quality: null }
    cur.spend       += Number(r.spend ?? 0)
    cur.leads       += Number(r.leads ?? 0)
    cur.impressions += Number(r.impressions ?? 0)
    cur.clicks      += Number(r.clicks ?? 0)
    if (!cur.quality && r.quality_ranking) cur.quality = r.quality_ranking
    adsetAgg.set(r.entity_id, cur)
  }

  // Build text
  const lines: string[] = []
  const budgetStr = campaign.daily_budget ? `R$${fmtBRL(campaign.daily_budget / 100)}/dia` : "sem limite diário"

  lines.push(`CONTEXTO CAMPANHA: "${campaign.name}"`)
  lines.push(`Status: ${campaign.status} | Objetivo: ${campaign.objective ?? "—"} | Budget: ${budgetStr}`)
  lines.push(`ID Meta: ${metaCampaignId}`)
  lines.push("")
  lines.push("=== MÉTRICAS (30 dias) ===")
  lines.push(`Spend: R$${fmtBRL(tot30.spend)} | Impressões: ${tot30.impressions.toLocaleString()} | Cliques: ${tot30.clicks}`)
  lines.push(`CTR médio: ${avgCtr.toFixed(2)}% | CPM médio: R$${fmtBRL(avgCpm)} | Frequência média: ${avgFreq.toFixed(2)}`)
  lines.push(`Leads Meta: ${tot30.leads} | CPL Meta: ${cplMeta ? `R$${fmtBRL(cplMeta)}` : "—"}`)
  lines.push(`Taxa LP (clique→LP): ${lpRate !== null ? fmtPct(lpRate) : "—"}`)
  lines.push("")
  lines.push("=== FUNIL CRM ===")
  lines.push(`Leads Meta (${tot30.leads}) → CRM (${crmLeads}, ${pct(crmLeads, tot30.leads)}) → Responderam (${responded}, ${pct(responded, crmLeads)}) → Qualificados (${qualified}, ${pct(qualified, responded)}) → Visitas (${visits}, ${pct(visits, qualified)}) → Propostas (${proposals}, ${pct(proposals, visits)})`)
  lines.push(`CPL Real (spend/responderam): ${cplReal ? `R$${fmtBRL(cplReal)}` : "—"}`)
  lines.push(`Taxa Qualificação: ${tot30.leads > 0 ? fmtPct((qualified / tot30.leads) * 100) : "—"}`)

  if (adsetAgg.size > 0) {
    lines.push("")
    lines.push("=== ADSETS (30d agregado) ===")
    const sorted = [...adsetAgg.entries()].sort((a, b) => b[1].spend - a[1].spend)
    for (const [id, m] of sorted.slice(0, 10)) {
      const cpl = m.leads > 0 ? `R$${fmtBRL(m.spend / m.leads)}` : "—"
      const quality = m.quality ? ` | Quality: ${m.quality}` : ""
      lines.push(`  ID:${id} | Spend: R$${fmtBRL(m.spend)} | Leads: ${m.leads} | CPL: ${cpl}${quality}`)
    }
  }

  if (placement.length > 0) {
    lines.push("")
    lines.push("=== POSICIONAMENTO ===")
    for (const p of placement.slice(0, 8)) {
      const cpl = p.leads > 0 ? `R$${fmtBRL(Number(p.spend) / p.leads)}` : "—"
      lines.push(`  ${p.publisher_platform}/${p.platform_position} | Spend: R$${fmtBRL(Number(p.spend))} | Leads: ${p.leads} | CPL: ${cpl}`)
    }
  }

  // 7-day timeseries
  const recent7 = insights.filter((r) => r.date >= date7dAgo).sort((a, b) => a.date.localeCompare(b.date))
  if (recent7.length > 0) {
    lines.push("")
    lines.push("=== TENDÊNCIA (últimos 7 dias) ===")
    lines.push("Data       | Spend    | Leads | CTR")
    for (const r of recent7) {
      const spend = `R$${fmtBRL(Number(r.spend))}`.padEnd(8)
      lines.push(`${r.date} | ${spend} | ${String(r.leads ?? 0).padEnd(5)} | ${Number(r.ctr ?? 0).toFixed(2)}%`)
    }
  }

  if (alerts.length > 0) {
    lines.push("")
    lines.push("=== ALERTAS DESTA CAMPANHA ===")
    for (const a of alerts) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.alert_type} (${a.fired_date}) — ${a.message}`)
    }
  }

  const text = lines.join("\n")
  setCached(key, text)
  return text
}

export function buildContext(
  supabase: SupabaseClient,
  orgId: string,
  contextType: "global" | "campaign",
  contextId?: string | null,
): Promise<string> {
  if (contextType === "campaign" && contextId) {
    return buildCampaignContext(supabase, orgId, contextId)
  }
  return buildGlobalContext(supabase, orgId)
}
