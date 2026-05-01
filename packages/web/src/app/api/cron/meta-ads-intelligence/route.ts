import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTelegramAdminAlert } from "@web/lib/telegram"

const CRON_SECRET = process.env.CRON_SECRET

// ─── Thresholds ────────────────────────────────────────────────────────────

const THRESHOLDS = {
  cplSpike: {
    multiplier: 1.3,   // CPL 3d > 130% do CPL 30d
    minSpend3d: 50,    // R$
  },
  zeroLeadsActive: {
    days: 7,
    minSpend: 100,     // R$
  },
  scaleCandidate: {
    cplRatioVsPortfolio: 0.6, // CPL real < 60% da média
    minTaxaQualificacao: 35,  // %
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
  accountName: string
  status: string
  spend3d: number
  spend7d: number
  spend30d: number
  leadsMeta3d: number
  leadsMeta7d: number
  leadsMeta30d: number
  responderam30d: number
  qualificados30d: number
  cplReal3d: number | null
  cplReal30d: number | null
  taxaQualificacao: number | null
}

interface Alert {
  type: "cpl_spike" | "zero_leads_active" | "scale_candidate"
  emoji: string
  message: string
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split("T")[0]
}

// ─── Alert detectors ───────────────────────────────────────────────────────

function detectCplSpike(m: CampaignMetrics): Alert | null {
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
    type: "cpl_spike",
    emoji: "🚨",
    message: `CPL disparou em *${m.campaignName}*: R$ ${fmtBRL(m.cplReal3d)} (era R$ ${fmtBRL(m.cplReal30d)} — +${pct}%)`,
  }
}

function detectZeroLeadsActive(m: CampaignMetrics): Alert | null {
  if (
    m.status !== "ACTIVE" ||
    m.leadsMeta7d > 0 ||
    m.spend7d < THRESHOLDS.zeroLeadsActive.minSpend
  ) return null

  return {
    type: "zero_leads_active",
    emoji: "⚠️",
    message: `*${m.campaignName}* ativa há 7d sem leads — gasto: R$ ${fmtBRL(m.spend7d)}`,
  }
}

function detectScaleCandidate(m: CampaignMetrics, portfolioAvgCpl: number): Alert | null {
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
    type: "scale_candidate",
    emoji: "💡",
    message: `*${m.campaignName}* é candidata a escalar: CPL R$ ${fmtBRL(m.cplReal30d)} (portfólio: R$ ${fmtBRL(portfolioAvgCpl)}) | Qualificação: ${m.taxaQualificacao.toFixed(1)}%`,
  }
}

// ─── Formatters ────────────────────────────────────────────────────────────

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

interface AccountSummary {
  accountName: string
  spend30d: number
  leadsMeta30d: number
  responderam30d: number
}

function formatResumoDiario(
  accountSummaries: AccountSummary[],
  top3: CampaignMetrics[],
  alerts: Alert[],
): string {
  const today = fmtDate(new Date())
  const criticalCount = alerts.filter((a) => a.type === "cpl_spike").length
  const warnCount = alerts.filter((a) => a.type === "zero_leads_active").length

  const lines: string[] = [`📊 *Resumo Meta Ads — ${today}*\n`]

  for (const acc of accountSummaries) {
    if (acc.spend30d === 0 && acc.leadsMeta30d === 0) {
      lines.push(`🏢 *${acc.accountName}* (30d)\n  Sem dados suficientes no período`)
    } else {
      const cplReal = acc.responderam30d > 0
        ? `R$ ${fmtBRL(acc.spend30d / acc.responderam30d)}`
        : "—"
      lines.push(
        `🏢 *${acc.accountName}* (30d)\n  Spend: R$ ${fmtBRL(acc.spend30d)} | Leads Meta: ${acc.leadsMeta30d} | Responderam: ${acc.responderam30d} | CPL Real: ${cplReal}`,
      )
    }
  }

  if (top3.length > 0) {
    lines.push("\n🔥 *Top 3 por CPL Real:*")
    top3.forEach((c, i) => {
      const qual = c.taxaQualificacao !== null ? ` | Qualificação: ${c.taxaQualificacao.toFixed(1)}%` : ""
      lines.push(`  ${i + 1}. ${c.campaignName} — R$ ${fmtBRL(c.cplReal30d!)}${qual}`)
    })
  }

  if (alerts.length > 0) {
    const alertSummary = [
      criticalCount > 0 ? `${criticalCount} crítico${criticalCount > 1 ? "s" : ""}` : null,
      warnCount > 0 ? `${warnCount} aviso${warnCount > 1 ? "s" : ""}` : null,
    ].filter(Boolean).join(", ")
    lines.push(`\n⚠️ *Alertas: ${alertSummary}*`)
    for (const alert of alerts) {
      lines.push(`${alert.emoji} ${alert.message}`)
    }
  } else {
    lines.push("\n✅ *Nenhum alerta disparado hoje.*")
  }

  return lines.join("\n")
}

function formatRelatorioSemanal(
  campaigns: CampaignMetrics[],
  prevWeekAvgCpl: number | null,
  currWeekAvgCpl: number | null,
): string {
  const today = fmtDate(new Date())
  const sorted = [...campaigns]
    .filter((c) => c.cplReal30d !== null)
    .sort((a, b) => (a.cplReal30d ?? Infinity) - (b.cplReal30d ?? Infinity))

  const lines: string[] = [`📅 *Relatório Semanal Meta Ads — ${today}*\n`]

  if (currWeekAvgCpl !== null && prevWeekAvgCpl !== null && prevWeekAvgCpl > 0) {
    const diff = currWeekAvgCpl - prevWeekAvgCpl
    const arrow = diff > 0 ? "↑" : "↓"
    const pct = Math.abs(Math.round((diff / prevWeekAvgCpl) * 100))
    lines.push(`📈 *CPL Médio:* R$ ${fmtBRL(currWeekAvgCpl)} ${arrow}${pct}% vs semana anterior\n`)
  }

  if (sorted.length > 0) {
    lines.push("🏆 *Ranking por CPL Real (30d):*")
    sorted.forEach((c, i) => {
      const qual = c.taxaQualificacao !== null ? ` | Q: ${c.taxaQualificacao.toFixed(1)}%` : ""
      lines.push(`  ${i + 1}. ${c.campaignName} — R$ ${fmtBRL(c.cplReal30d!)}${qual}`)
    })

    if (sorted.length >= 3) {
      lines.push("\n🟢 *Top 3 Melhores:*")
      sorted.slice(0, 3).forEach((c) => {
        lines.push(`  • ${c.campaignName} — R$ ${fmtBRL(c.cplReal30d!)}`)
      })
      lines.push("\n🔴 *Bottom 3 Piores:*")
      sorted.slice(-3).reverse().forEach((c) => {
        lines.push(`  • ${c.campaignName} — R$ ${fmtBRL(c.cplReal30d!)}`)
      })
    }
  }

  return lines.join("\n")
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
  const isMonday = new Date().getUTCDay() === 1

  // Buscar todas as orgs com contas Meta ativas
  const { data: accounts } = await supabase
    .from("meta_ad_accounts")
    .select("id, org_id, meta_account_id, name")
    .eq("status", "active")

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no_active_accounts" })
  }

  // Registrar início no sync log (por org — pegar primeira)
  const orgId = accounts[0].org_id
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
    const yesterday = daysAgo(1)
    const date3dAgo = daysAgo(3)
    const date7dAgo = daysAgo(7)
    const date30dAgo = daysAgo(30)
    const date37dAgo = daysAgo(37)

    // AC8: verificar dados do dia anterior
    const { data: yesterdayCheck } = await supabase
      .from("meta_insights_daily")
      .select("id")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .eq("date", yesterday)
      .limit(1)

    if (!yesterdayCheck || yesterdayCheck.length === 0) {
      if (syncLog) {
        await supabase.from("meta_sync_log").update({
          finished_at: new Date().toISOString(),
          status: "success",
          records_synced: 0,
        }).eq("id", syncLog.id)
      }
      // Registrar skip
      await supabase.from("meta_sync_log").insert({
        org_id: orgId,
        sync_type: "intelligence_skip",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "success",
        records_synced: 0,
      })
      console.log("[META_INTELLIGENCE] No data for yesterday — skipping")
      return NextResponse.json({ ok: true, skipped: "no_yesterday_data" })
    }

    // Buscar campanhas
    const { data: campaigns } = await supabase
      .from("meta_campaigns")
      .select("meta_campaign_id, name, status, org_id")
      .eq("org_id", orgId)

    if (!campaigns || campaigns.length === 0) {
      if (syncLog) {
        await supabase.from("meta_sync_log").update({
          finished_at: new Date().toISOString(),
          status: "success",
          records_synced: 0,
        }).eq("id", syncLog.id)
      }
      return NextResponse.json({ ok: true, campaigns_analyzed: 0 })
    }

    // Buscar insights 30d + 37d (37d para baseline da semana anterior)
    const { data: insights30d } = await supabase
      .from("meta_insights_daily")
      .select("entity_id, date, leads, spend")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .gte("date", date30dAgo)
      .lte("date", yesterday)

    const { data: insights37d } = await supabase
      .from("meta_insights_daily")
      .select("entity_id, date, leads, spend")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .gte("date", date37dAgo)
      .lt("date", date7dAgo)

    // Buscar leads CRM com join duplo
    const campaignNames = campaigns.map((c) => c.name).filter(Boolean) as string[]
    const campaignMetaIds = campaigns.map((c) => c.meta_campaign_id).filter(Boolean) as string[]

    const [byNameResult, byMetaIdResult] = await Promise.all([
      campaignNames.length > 0
        ? supabase
            .from("leads")
            .select("id, utm_campaign, last_response_at, status, metadata")
            .eq("org_id", orgId)
            .in("source", ["meta_ads", "whatsapp_click_to_ad"])
            .in("utm_campaign", campaignNames)
        : Promise.resolve({ data: [] as { id: string; utm_campaign: string | null; last_response_at: string | null; status: string | null; metadata: Record<string, unknown> | null }[] }),
      campaignMetaIds.length > 0
        ? supabase
            .from("leads")
            .select("id, utm_campaign, last_response_at, status, metadata")
            .eq("org_id", orgId)
            .in("source", ["meta_ads", "whatsapp_click_to_ad"])
        : Promise.resolve({ data: [] as { id: string; utm_campaign: string | null; last_response_at: string | null; status: string | null; metadata: Record<string, unknown> | null }[] }),
    ])

    // Deduplicate leads
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

    // Indexar insights por campaignId
    const insightsByCampaign = new Map<string, { spend3d: number; spend7d: number; spend30d: number; leads3d: number; leads7d: number; leads30d: number }>()

    for (const row of insights30d ?? []) {
      const entry = insightsByCampaign.get(row.entity_id) ?? { spend3d: 0, spend7d: 0, spend30d: 0, leads3d: 0, leads7d: 0, leads30d: 0 }
      const spend = Number(row.spend ?? 0)
      const leads = row.leads ?? 0
      entry.spend30d += spend
      entry.leads30d += leads
      if (row.date >= date7dAgo) { entry.spend7d += spend; entry.leads7d += leads }
      if (row.date >= date3dAgo) { entry.spend3d += spend; entry.leads3d += leads }
      insightsByCampaign.set(row.entity_id, entry)
    }

    // Calcular métricas por campanha
    const campaignMetrics: CampaignMetrics[] = campaigns.map((c) => {
      const ins = insightsByCampaign.get(c.meta_campaign_id) ?? { spend3d: 0, spend7d: 0, spend30d: 0, leads3d: 0, leads7d: 0, leads30d: 0 }

      const campaignLeads = allLeads.filter(
        (l) =>
          (c.name && l.utm_campaign === c.name) ||
          l.campaignMetaId === c.meta_campaign_id,
      )
      const responderam30d = campaignLeads.filter((l) => l.last_response_at != null).length
      const qualificados30d = campaignLeads.filter(
        (l) => l.last_response_at != null && QUALIFIED_STATUSES.has(l.status ?? ""),
      ).length

      const cplReal30d = responderam30d > 0
        ? Math.round((ins.spend30d / responderam30d) * 100) / 100
        : null

      const cplReal3d = (() => {
        const responderam3d = campaignLeads.filter((l) => l.last_response_at != null).length
        return responderam3d > 0 && ins.spend3d > 0
          ? Math.round((ins.spend3d / responderam3d) * 100) / 100
          : null
      })()

      const taxaQualificacao = ins.leads30d > 0
        ? Math.round((qualificados30d / ins.leads30d) * 10000) / 100
        : null

      const accountEntry = accounts.find((a) => a.org_id === c.org_id)
      const accountName = accountEntry?.name ?? "Conta Meta"

      return {
        campaignId: c.meta_campaign_id,
        campaignName: c.name ?? c.meta_campaign_id,
        orgId: c.org_id,
        accountName,
        status: c.status ?? "",
        spend3d: ins.spend3d,
        spend7d: ins.spend7d,
        spend30d: ins.spend30d,
        leadsMeta3d: ins.leads3d,
        leadsMeta7d: ins.leads7d,
        leadsMeta30d: ins.leads30d,
        responderam30d,
        qualificados30d,
        cplReal3d,
        cplReal30d,
        taxaQualificacao,
      }
    })

    // Calcular CPL médio do portfólio (média ponderada por spend)
    const validCpls = campaignMetrics.filter((m) => m.cplReal30d !== null && m.spend30d > 0)
    const totalSpendValid = validCpls.reduce((s, m) => s + m.spend30d, 0)
    const portfolioAvgCpl =
      totalSpendValid > 0
        ? validCpls.reduce((s, m) => s + m.cplReal30d! * m.spend30d, 0) / totalSpendValid
        : 0

    // Detectar alertas
    const alerts: Alert[] = []
    for (const m of campaignMetrics) {
      const spike = detectCplSpike(m)
      if (spike) alerts.push(spike)
      const zero = detectZeroLeadsActive(m)
      if (zero) alerts.push(zero)
      const scale = detectScaleCandidate(m, portfolioAvgCpl)
      if (scale) alerts.push(scale)
    }

    // Construir sumário por conta
    const accountNames = [...new Set(campaignMetrics.map((m) => m.accountName))]
    const accountSummaries: AccountSummary[] = accountNames.map((name) => {
      const cams = campaignMetrics.filter((m) => m.accountName === name)
      return {
        accountName: name,
        spend30d: cams.reduce((s, m) => s + m.spend30d, 0),
        leadsMeta30d: cams.reduce((s, m) => s + m.leadsMeta30d, 0),
        responderam30d: cams.reduce((s, m) => s + m.responderam30d, 0),
      }
    })

    // Top 3 por CPL real
    const top3 = [...campaignMetrics]
      .filter((m) => m.cplReal30d !== null && m.cplReal30d > 0)
      .sort((a, b) => (a.cplReal30d ?? Infinity) - (b.cplReal30d ?? Infinity))
      .slice(0, 3)

    // Montar mensagem
    let message: string
    if (isMonday) {
      // Calcular CPL médio semana anterior para trend
      const prev7dSpend = (insights37d ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0)
      const prev7dLeadsMeta = (insights37d ?? []).reduce((s, r) => s + (r.leads ?? 0), 0)
      const currWeekAvgCpl = portfolioAvgCpl > 0 ? portfolioAvgCpl : null
      const prevWeekAvgCpl = prev7dLeadsMeta > 0 ? prev7dSpend / prev7dLeadsMeta : null
      message = formatRelatorioSemanal(campaignMetrics, prevWeekAvgCpl, currWeekAvgCpl)
    } else {
      message = formatResumoDiario(accountSummaries, top3, alerts)
    }

    await sendTelegramAdminAlert(message)

    // Atualizar sync log
    if (syncLog) {
      await supabase
        .from("meta_sync_log")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          records_synced: campaignMetrics.length,
        })
        .eq("id", syncLog.id)
    }

    console.log(
      `[META_INTELLIGENCE] Done — ${campaignMetrics.length} campaigns, ${alerts.length} alerts`,
    )

    return NextResponse.json({
      ok: true,
      campaigns_analyzed: campaignMetrics.length,
      alerts_fired: alerts.length,
      weekly_report: isMonday,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error("[META_INTELLIGENCE] Error:", errorMessage)

    if (syncLog) {
      await supabase
        .from("meta_sync_log")
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
