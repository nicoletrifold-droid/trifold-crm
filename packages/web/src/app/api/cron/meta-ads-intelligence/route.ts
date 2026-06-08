import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET

// ─── Thresholds ────────────────────────────────────────────────────────────

const THRESHOLDS = {
  cplSpike: {
    multiplier: 1.3,      // CPL 3d > 130% do CPL 30d
    minSpend3d: 50,        // R$
  },
  zeroLeadsActive: {
    days: 7,
    minSpend: 100,         // R$
  },
  scaleCandidate: {
    cplRatioVsPortfolio: 0.6,   // CPL real < 60% da média ponderada
    minTaxaQualificacao: 35,    // %
  },
  frequencySaturation: {
    threshold: 2.8,        // frequência média 7d acima disto = saturação
    minSpend7d: 150,       // R$
  },
  creativeFatigue: {
    ctrDropRatio: 0.65,    // CTR 3d < 65% do baseline 14d
    minImpressions3d: 500, // mínimo de impressões nos 3 dias recentes
  },
  budgetUnderdelivery: {
    utilizationMin: 0.70,  // spend_yesterday / daily_budget < 70%
    minDailyBudget: 30,    // R$ — ignora campanhas com budget muito pequeno
  },
}

const QUALIFIED_STATUSES = new Set([
  "contacted", "qualified", "visit_scheduled", "visited", "proposal", "closed",
])

// ─── Types ─────────────────────────────────────────────────────────────────

interface CampaignMetrics {
  campaignId: string
  campaignName: string
  orgId: string
  status: string
  spend3d: number
  spend7d: number
  spend30d: number
  spendYesterday: number
  leadsMeta3d: number
  leadsMeta7d: number
  leadsMeta30d: number
  responderam30d: number
  qualificados30d: number
  cplReal3d: number | null
  cplReal30d: number | null
  taxaQualificacao: number | null
  frequency7d: number | null  // avg daily frequency over last 7 days
  dailyBudgetReais: number    // 0 when no daily budget set
}

interface AlertRow {
  org_id: string
  alert_type: string
  level: string
  entity_id: string
  entity_name: string | null
  severity: "info" | "warning" | "critical"
  message: string
  metadata: Record<string, unknown> | null
  fired_date: string
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split("T")[0]!
}

// ─── Alert detectors ───────────────────────────────────────────────────────

function detectCplSpike(m: CampaignMetrics, today: string): AlertRow | null {
  if (
    m.cplReal3d === null ||
    m.cplReal30d === null ||
    m.cplReal30d === 0 ||
    m.spend3d < THRESHOLDS.cplSpike.minSpend3d
  ) return null

  const ratio = m.cplReal3d / m.cplReal30d
  if (ratio <= THRESHOLDS.cplSpike.multiplier) return null

  const pct = Math.round((ratio - 1) * 100)
  return {
    org_id: m.orgId,
    alert_type: "cpl_spike",
    level: "campaign",
    entity_id: m.campaignId,
    entity_name: m.campaignName,
    severity: "critical",
    message: `CPL disparou em "${m.campaignName}": R$ ${fmtBRL(m.cplReal3d)} nos últimos 3d (era R$ ${fmtBRL(m.cplReal30d)} nos 30d — +${pct}%)`,
    metadata: { cpl_3d: m.cplReal3d, cpl_30d: m.cplReal30d, pct_change: pct, spend_3d: m.spend3d },
    fired_date: today,
  }
}

function detectZeroLeadsActive(m: CampaignMetrics, today: string): AlertRow | null {
  if (
    m.status !== "ACTIVE" ||
    m.leadsMeta7d > 0 ||
    m.spend7d < THRESHOLDS.zeroLeadsActive.minSpend
  ) return null

  return {
    org_id: m.orgId,
    alert_type: "zero_leads_active",
    level: "campaign",
    entity_id: m.campaignId,
    entity_name: m.campaignName,
    severity: "warning",
    message: `"${m.campaignName}" está ativa há 7 dias sem gerar leads — gasto: R$ ${fmtBRL(m.spend7d)}`,
    metadata: { spend_7d: m.spend7d, status: m.status },
    fired_date: today,
  }
}

function detectScaleCandidate(m: CampaignMetrics, portfolioAvgCpl: number, today: string): AlertRow | null {
  if (
    m.cplReal30d === null ||
    portfolioAvgCpl === 0 ||
    m.taxaQualificacao === null
  ) return null

  const ratio = m.cplReal30d / portfolioAvgCpl
  if (
    ratio >= THRESHOLDS.scaleCandidate.cplRatioVsPortfolio ||
    m.taxaQualificacao < THRESHOLDS.scaleCandidate.minTaxaQualificacao
  ) return null

  return {
    org_id: m.orgId,
    alert_type: "scale_candidate",
    level: "campaign",
    entity_id: m.campaignId,
    entity_name: m.campaignName,
    severity: "info",
    message: `"${m.campaignName}" candidata a escalar: CPL R$ ${fmtBRL(m.cplReal30d)} vs portfólio R$ ${fmtBRL(portfolioAvgCpl)} | Qualificação: ${m.taxaQualificacao.toFixed(1)}%`,
    metadata: { cpl_real: m.cplReal30d, portfolio_avg_cpl: portfolioAvgCpl, taxa_qualificacao: m.taxaQualificacao },
    fired_date: today,
  }
}

function detectFrequencySaturation(m: CampaignMetrics, today: string): AlertRow | null {
  if (
    m.frequency7d === null ||
    m.status !== "ACTIVE" ||
    m.spend7d < THRESHOLDS.frequencySaturation.minSpend7d
  ) return null

  if (m.frequency7d <= THRESHOLDS.frequencySaturation.threshold) return null

  return {
    org_id: m.orgId,
    alert_type: "frequency_saturation",
    level: "campaign",
    entity_id: m.campaignId,
    entity_name: m.campaignName,
    severity: "warning",
    message: `"${m.campaignName}" com frequência ${m.frequency7d.toFixed(2)} nos últimos 7 dias — audiência saturando`,
    metadata: { frequency_7d: m.frequency7d, spend_7d: m.spend7d },
    fired_date: today,
  }
}

function detectBudgetUnderdelivery(m: CampaignMetrics, today: string): AlertRow | null {
  if (
    m.status !== "ACTIVE" ||
    m.dailyBudgetReais < THRESHOLDS.budgetUnderdelivery.minDailyBudget
  ) return null

  const utilization = m.spendYesterday / m.dailyBudgetReais
  if (utilization >= THRESHOLDS.budgetUnderdelivery.utilizationMin) return null

  const pct = Math.round(utilization * 100)
  return {
    org_id: m.orgId,
    alert_type: "budget_underdelivery",
    level: "campaign",
    entity_id: m.campaignId,
    entity_name: m.campaignName,
    severity: "warning",
    message: `"${m.campaignName}" consumiu apenas ${pct}% do budget ontem (R$ ${fmtBRL(m.spendYesterday)} de R$ ${fmtBRL(m.dailyBudgetReais)}) — possível limitação de audiência ou lance`,
    metadata: { spend_yesterday: m.spendYesterday, daily_budget: m.dailyBudgetReais, utilization_pct: pct },
    fired_date: today,
  }
}

// ─── Formatter ─────────────────────────────────────────────────────────────

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[META_INTELLIGENCE] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()
  const today = startedAt.split("T")[0]!

  const { data: accounts } = await supabase
    .from("meta_ad_accounts")
    .select("id, org_id, meta_account_id, name")
    .eq("status", "active")

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no_active_accounts" })
  }

  const orgId = accounts[0]!.org_id

  const { data: syncLog } = await supabase
    .from("meta_sync_log")
    .insert({
      org_id: orgId,
      sync_type: "intelligence",
      started_at: startedAt,
      status: "running",
    })
    .select("id")
    .single()

  try {
    const yesterday  = daysAgo(1)
    const date3dAgo  = daysAgo(3)
    const date7dAgo  = daysAgo(7)
    const date17dAgo = daysAgo(17)
    const date30dAgo = daysAgo(30)

    // Verify yesterday data exists
    const { data: yesterdayCheck } = await supabase
      .from("meta_insights_daily")
      .select("id")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .eq("date", yesterday)
      .limit(1)

    if (!yesterdayCheck || yesterdayCheck.length === 0) {
      if (syncLog) {
        await supabase.from("meta_sync_log")
          .update({ finished_at: new Date().toISOString(), status: "success", records_synced: 0 })
          .eq("id", syncLog.id)
      }
      console.log("[META_INTELLIGENCE] No data for yesterday — skipping")
      return NextResponse.json({ ok: true, skipped: "no_yesterday_data" })
    }

    // ── Fetch campaigns (with daily_budget for underdelivery check) ──────────
    const { data: campaigns } = await supabase
      .from("meta_campaigns")
      .select("meta_campaign_id, name, status, org_id, daily_budget")
      .eq("org_id", orgId)

    if (!campaigns || campaigns.length === 0) {
      if (syncLog) {
        await supabase.from("meta_sync_log")
          .update({ finished_at: new Date().toISOString(), status: "success", records_synced: 0 })
          .eq("id", syncLog.id)
      }
      return NextResponse.json({ ok: true, campaigns_analyzed: 0 })
    }

    // ── Fetch campaign-level insights 30d (+ frequency) ──────────────────────
    const { data: insights30d } = await supabase
      .from("meta_insights_daily")
      .select("entity_id, date, leads, spend, frequency")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .gte("date", date30dAgo)
      .lte("date", yesterday)

    // ── Fetch ad-level insights 17d for creative fatigue ─────────────────────
    const { data: adInsights17d } = await supabase
      .from("meta_insights_daily")
      .select("entity_id, date, ctr, impressions")
      .eq("org_id", orgId)
      .eq("level", "ad")
      .gte("date", date17dAgo)
      .lte("date", yesterday)

    // Ad names for fatigue alerts
    const { data: adRows } = await supabase
      .from("meta_ads")
      .select("meta_ad_id, name")
      .eq("org_id", orgId)

    const adNameById = new Map<string, string>()
    for (const ad of adRows ?? []) {
      adNameById.set(ad.meta_ad_id, ad.name ?? ad.meta_ad_id)
    }

    // ── Fetch CRM leads ───────────────────────────────────────────────────────
    const campaignNames  = campaigns.map((c) => c.name).filter(Boolean) as string[]
    const campaignMetaIds = campaigns.map((c) => c.meta_campaign_id).filter(Boolean) as string[]

    const [byNameResult, byMetaIdResult] = await Promise.all([
      campaignNames.length > 0
        ? supabase
            .from("leads")
            .select("id, utm_campaign, last_response_at, status, metadata")
            .eq("org_id", orgId)
            .in("source", ["meta_ads", "whatsapp_click_to_ad"])
            .in("utm_campaign", campaignNames)
        : Promise.resolve({ data: [] as LeadRow[] }),
      campaignMetaIds.length > 0
        ? supabase
            .from("leads")
            .select("id, utm_campaign, last_response_at, status, metadata")
            .eq("org_id", orgId)
            .in("source", ["meta_ads", "whatsapp_click_to_ad"])
        : Promise.resolve({ data: [] as LeadRow[] }),
    ])

    type LeadRow = { id: string; utm_campaign: string | null; last_response_at: string | null; status: string | null; metadata: Record<string, unknown> | null }
    type LeadEntry = { utm_campaign: string | null; last_response_at: string | null; status: string | null; campaignMetaId: string | null }

    const leadsMap = new Map<string, LeadEntry>()
    for (const lead of [...(byNameResult.data ?? []), ...(byMetaIdResult.data ?? [])]) {
      if (!leadsMap.has(lead.id)) {
        const metaId = (lead.metadata as Record<string, unknown> | null)?.campaign_id as string | undefined
        leadsMap.set(lead.id, {
          utm_campaign: lead.utm_campaign,
          last_response_at: lead.last_response_at,
          status: lead.status,
          campaignMetaId: metaId ?? null,
        })
      }
    }
    const allLeads = Array.from(leadsMap.values())

    // ── Index insights by campaign ────────────────────────────────────────────
    interface InsightAgg {
      spend3d: number; spend7d: number; spend30d: number; spendYesterday: number
      leads3d: number; leads7d: number; leads30d: number
      frequency7dSum: number; frequency7dDays: number
    }

    const insightsByCampaign = new Map<string, InsightAgg>()

    for (const row of insights30d ?? []) {
      const entry = insightsByCampaign.get(row.entity_id) ?? {
        spend3d: 0, spend7d: 0, spend30d: 0, spendYesterday: 0,
        leads3d: 0, leads7d: 0, leads30d: 0,
        frequency7dSum: 0, frequency7dDays: 0,
      }
      const spend = Number(row.spend ?? 0)
      const leads = row.leads ?? 0
      const freq  = Number(row.frequency ?? 0)

      entry.spend30d += spend
      entry.leads30d += leads

      if (row.date >= date7dAgo) {
        entry.spend7d += spend
        entry.leads7d += leads
        if (freq > 0) { entry.frequency7dSum += freq; entry.frequency7dDays++ }
      }
      if (row.date >= date3dAgo) { entry.spend3d += spend; entry.leads3d += leads }
      if (row.date === yesterday)  { entry.spendYesterday = spend }

      insightsByCampaign.set(row.entity_id, entry)
    }

    // ── Build campaign metrics ────────────────────────────────────────────────
    const campaignMetrics: CampaignMetrics[] = campaigns.map((c) => {
      const ins = insightsByCampaign.get(c.meta_campaign_id) ?? {
        spend3d: 0, spend7d: 0, spend30d: 0, spendYesterday: 0,
        leads3d: 0, leads7d: 0, leads30d: 0,
        frequency7dSum: 0, frequency7dDays: 0,
      }

      const campaignLeads = allLeads.filter(
        (l) => (c.name && l.utm_campaign === c.name) || l.campaignMetaId === c.meta_campaign_id,
      )
      const responderam30d   = campaignLeads.filter((l) => l.last_response_at != null).length
      const qualificados30d  = campaignLeads.filter(
        (l) => l.last_response_at != null && QUALIFIED_STATUSES.has(l.status ?? ""),
      ).length

      const cplReal30d = responderam30d > 0
        ? Math.round((ins.spend30d / responderam30d) * 100) / 100
        : null

      const cplReal3d = (() => {
        const responderam3d = campaignLeads.filter(
          (l) => l.last_response_at != null && (l.last_response_at ?? "") >= date3dAgo,
        ).length
        return responderam3d > 0 && ins.spend3d > 0
          ? Math.round((ins.spend3d / responderam3d) * 100) / 100
          : null
      })()

      const taxaQualificacao = ins.leads30d > 0
        ? Math.round((qualificados30d / ins.leads30d) * 10000) / 100
        : null

      const frequency7d = ins.frequency7dDays > 0
        ? Math.round((ins.frequency7dSum / ins.frequency7dDays) * 100) / 100
        : null

      const dailyBudgetReais = c.daily_budget ? c.daily_budget / 100 : 0

      return {
        campaignId: c.meta_campaign_id,
        campaignName: c.name ?? c.meta_campaign_id,
        orgId: c.org_id,
        status: c.status ?? "",
        spend3d: ins.spend3d,
        spend7d: ins.spend7d,
        spend30d: ins.spend30d,
        spendYesterday: ins.spendYesterday,
        leadsMeta3d: ins.leads3d,
        leadsMeta7d: ins.leads7d,
        leadsMeta30d: ins.leads30d,
        responderam30d,
        qualificados30d,
        cplReal3d,
        cplReal30d,
        taxaQualificacao,
        frequency7d,
        dailyBudgetReais,
      }
    })

    // ── Portfolio average CPL (weighted by spend) ─────────────────────────────
    const validCpls = campaignMetrics.filter((m) => m.cplReal30d !== null && m.spend30d > 0)
    const totalSpendValid = validCpls.reduce((s, m) => s + m.spend30d, 0)
    const portfolioAvgCpl = totalSpendValid > 0
      ? validCpls.reduce((s, m) => s + m.cplReal30d! * m.spend30d, 0) / totalSpendValid
      : 0

    // ── Creative fatigue detection (ad level) ─────────────────────────────────
    interface AdInsightAgg {
      ctrRecent: number[]; ctrBaseline: number[]
      impressions3d: number
    }

    const adAgg = new Map<string, AdInsightAgg>()
    for (const row of adInsights17d ?? []) {
      const entry = adAgg.get(row.entity_id) ?? { ctrRecent: [], ctrBaseline: [], impressions3d: 0 }
      const ctr = Number(row.ctr ?? 0)
      if (row.date >= date3dAgo) {
        entry.ctrRecent.push(ctr)
        entry.impressions3d += Number(row.impressions ?? 0)
      } else {
        entry.ctrBaseline.push(ctr)
      }
      adAgg.set(row.entity_id, entry)
    }

    const creativeFatigueAlerts: AlertRow[] = []
    for (const [adId, agg] of adAgg.entries()) {
      if (
        agg.ctrRecent.length === 0 ||
        agg.ctrBaseline.length === 0 ||
        agg.impressions3d < THRESHOLDS.creativeFatigue.minImpressions3d
      ) continue

      const avgRecent   = agg.ctrRecent.reduce((s, v) => s + v, 0)   / agg.ctrRecent.length
      const avgBaseline = agg.ctrBaseline.reduce((s, v) => s + v, 0) / agg.ctrBaseline.length

      if (avgBaseline === 0 || avgRecent / avgBaseline >= THRESHOLDS.creativeFatigue.ctrDropRatio) continue

      const dropPct = Math.round((1 - avgRecent / avgBaseline) * 100)
      const adName  = adNameById.get(adId) ?? adId

      creativeFatigueAlerts.push({
        org_id: orgId,
        alert_type: "creative_fatigue",
        level: "ad",
        entity_id: adId,
        entity_name: adName,
        severity: "warning",
        message: `Anúncio "${adName}" com queda de ${dropPct}% no CTR vs baseline 14d — considerar rotação de criativo`,
        metadata: {
          ctr_recent_avg: Math.round(avgRecent * 10000) / 10000,
          ctr_baseline_avg: Math.round(avgBaseline * 10000) / 10000,
          drop_pct: dropPct,
          impressions_3d: agg.impressions3d,
        },
        fired_date: today,
      })
    }

    // ── Collect all campaign-level alerts ─────────────────────────────────────
    const alerts: AlertRow[] = []
    for (const m of campaignMetrics) {
      const a1 = detectCplSpike(m, today)
      const a2 = detectZeroLeadsActive(m, today)
      const a3 = detectScaleCandidate(m, portfolioAvgCpl, today)
      const a4 = detectFrequencySaturation(m, today)
      const a5 = detectBudgetUnderdelivery(m, today)
      if (a1) alerts.push(a1)
      if (a2) alerts.push(a2)
      if (a3) alerts.push(a3)
      if (a4) alerts.push(a4)
      if (a5) alerts.push(a5)
    }
    alerts.push(...creativeFatigueAlerts)

    // ── Upsert alerts → meta_alerts ───────────────────────────────────────────
    if (alerts.length > 0) {
      const { error: alertErr } = await supabase
        .from("meta_alerts")
        .upsert(alerts, { onConflict: "org_id,alert_type,entity_id,fired_date", ignoreDuplicates: true })

      if (alertErr) {
        console.error("[META_INTELLIGENCE] Failed to upsert alerts:", alertErr.message)
      }
    }

    if (syncLog) {
      await supabase.from("meta_sync_log")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          records_synced: campaignMetrics.length,
        })
        .eq("id", syncLog.id)
    }

    const summary = {
      cpl_spike:            alerts.filter((a) => a.alert_type === "cpl_spike").length,
      zero_leads_active:    alerts.filter((a) => a.alert_type === "zero_leads_active").length,
      scale_candidate:      alerts.filter((a) => a.alert_type === "scale_candidate").length,
      frequency_saturation: alerts.filter((a) => a.alert_type === "frequency_saturation").length,
      creative_fatigue:     alerts.filter((a) => a.alert_type === "creative_fatigue").length,
      budget_underdelivery: alerts.filter((a) => a.alert_type === "budget_underdelivery").length,
    }

    console.log(
      `[META_INTELLIGENCE] Done — ${campaignMetrics.length} campaigns, ${alerts.length} alerts`,
      summary,
    )

    return NextResponse.json({
      ok: true,
      campaigns_analyzed: campaignMetrics.length,
      alerts_fired: alerts.length,
      summary,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error("[META_INTELLIGENCE] Error:", errorMessage)

    if (syncLog) {
      await supabase.from("meta_sync_log")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: errorMessage,
        })
        .eq("id", syncLog.id)
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
