import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { metaFetch, MetaOAuthException } from "@trifold/shared"
import type { MetaPagedResponse } from "@trifold/shared"
const CRON_SECRET = process.env.CRON_SECRET

interface MetaAction {
  action_type: string
  value: string
}

interface InsightBase {
  spend: string
  impressions: string
  reach: string
  clicks: string
  ctr: string
  cpc: string
  cpm: string
  frequency: string
  date_start: string
  date_stop: string
  actions?: MetaAction[]
  cost_per_action_type?: MetaAction[]
  outbound_clicks?: MetaAction[]
}

interface InsightWithCampaignId extends InsightBase {
  campaign_id: string
}

interface InsightWithAdsetId extends InsightBase {
  adset_id: string
}

interface InsightWithAdId extends InsightBase {
  ad_id: string
  quality_ranking?: string
  engagement_rate_ranking?: string
  conversion_rate_ranking?: string
  video_30_sec_watched_actions?: MetaAction[]
  video_thruplay_watched_actions?: MetaAction[]
  video_p25_watched_actions?: MetaAction[]
  video_p50_watched_actions?: MetaAction[]
  video_p75_watched_actions?: MetaAction[]
  video_p100_watched_actions?: MetaAction[]
}

// Base fields for campaign and adset levels
const INSIGHT_FIELDS_BASE = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "actions",
  "cost_per_action_type",
  "outbound_clicks",
  "date_start",
  "date_stop",
].join(",")

// Ad-level fields: base + quality rankings + video engagement
const INSIGHT_FIELDS_AD = [
  ...INSIGHT_FIELDS_BASE.split(","),
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
  "video_30_sec_watched_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
].join(",")

function buildVideoMetrics(i: InsightWithAdId): Record<string, number> | null {
  const sec30    = extractActionValue(i.video_30_sec_watched_actions,   "video_30_sec_watched_actions")
  const thruplay = extractActionValue(i.video_thruplay_watched_actions, "video_thruplay_watched_actions")
  const p25      = extractActionValue(i.video_p25_watched_actions,      "video_p25_watched_actions")
  const p50      = extractActionValue(i.video_p50_watched_actions,      "video_p50_watched_actions")
  const p75      = extractActionValue(i.video_p75_watched_actions,      "video_p75_watched_actions")
  const p100     = extractActionValue(i.video_p100_watched_actions,     "video_p100_watched_actions")
  if (!sec30 && !thruplay && !p25 && !p50 && !p75 && !p100) return null
  const impressions = parseInt(i.impressions, 10) || 1
  return {
    sec30,
    thruplay,
    p25,
    p50,
    p75,
    p100,
    hook_rate:       Math.round((sec30    / impressions) * 10000) / 100,
    completion_rate: Math.round((thruplay / impressions) * 10000) / 100,
  }
}

function extractActionValue(arr: MetaAction[] | undefined, type: string): number {
  return Math.round(parseFloat(arr?.find((a) => a.action_type === type)?.value ?? "0"))
}

function extractCostValue(arr: MetaAction[] | undefined, type: string): number | null {
  const val = arr?.find((a) => a.action_type === type)?.value
  return val != null ? parseFloat(val) : null
}

async function fetchAllPages<T>(
  path: string,
  token: string,
  params: Record<string, string>,
): Promise<{ data: T[]; apiCalls: number }> {
  const results: T[] = []
  let cursor: string | undefined
  let apiCalls = 0

  do {
    const response = await metaFetch<MetaPagedResponse<T>>(path, token, {
      params: { ...params, ...(cursor ? { after: cursor } : {}), limit: "100" },
    })
    apiCalls++
    results.push(...response.data)
    cursor = response.paging?.next ? response.paging.cursors.after : undefined
  } while (cursor)

  return { data: results, apiCalls }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[META_INSIGHTS] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: accounts, error: accountsError } = await supabase
    .from("meta_ad_accounts")
    .select("id, org_id, meta_account_id, access_token")
    .eq("status", "active")

  if (accountsError) {
    console.error("[META_INSIGHTS] Failed to fetch ad accounts:", accountsError.message)
    return NextResponse.json({ error: accountsError.message }, { status: 500 })
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, accounts_synced: 0 })
  }

  const results: Array<{ account_id: string; status: string; records_synced?: number }> = []

  for (const account of accounts) {
    if (!account.access_token) {
      console.warn(`[META_INSIGHTS] Account ${account.id} has no token — skipping`)
      results.push({ account_id: account.id, status: "skipped_no_token" })
      continue
    }

    const { data: syncLog } = await supabase
      .from("meta_sync_log")
      .insert({
        org_id: account.org_id,
        sync_type: "insights",
        started_at: new Date().toISOString(),
        status: "running",
      })
      .select("id")
      .single()

    let totalRecords = 0
    let totalApiCalls = 0

    // Story 75-262 — falha de UM nível não pode impedir os outros.
    // Era isso que fazia o buraco durar 8 semanas: campanha e conjunto gravavam,
    // o nível de anúncio estourava numa CHECK constraint, e o run era marcado
    // 'error' com 2/3 do dado dentro. O dashboard de campanha seguia correto e
    // ninguém olhava o log.
    const porNivel: Record<"campaign" | "adset" | "ad", { linhas: number; erro: string | null }> = {
      campaign: { linhas: 0, erro: null },
      adset: { linhas: 0, erro: null },
      ad: { linhas: 0, erro: null },
    }
    const falhaDeNivel = (nivel: keyof typeof porNivel, err: unknown): void => {
      // Token morto é da CONTA, não de um nível: sobe para o catch externo, que
      // marca a conta e alerta.
      if (err instanceof MetaOAuthException) throw err
      porNivel[nivel].erro = err instanceof Error ? err.message : String(err)
      console.error(`[META_INSIGHTS] nível ${nivel} falhou — os outros seguem:`, porNivel[nivel].erro)
    }

    try {
      const token = account.access_token
      const accountPath = account.meta_account_id
      const insightsPath = `${accountPath}/insights`

      // --- Campaign level ---
      try {
      const { data: campaignInsights, apiCalls: campaignCalls } =
        await fetchAllPages<InsightWithCampaignId>(insightsPath, token, {
          level: "campaign",
          date_preset: "yesterday",
          fields: `campaign_id,${INSIGHT_FIELDS_BASE}`,
        })
      totalApiCalls += campaignCalls

      if (campaignInsights.length > 0) {
        const campaignRows = campaignInsights.map((i) => ({
          org_id: account.org_id,
          level: "campaign",
          entity_id: i.campaign_id,
          date: i.date_start,
          spend: parseFloat(i.spend),
          impressions: parseInt(i.impressions, 10),
          reach: parseInt(i.reach, 10),
          clicks: parseInt(i.clicks, 10),
          ctr: parseFloat(i.ctr),
          cpc: parseFloat(i.cpc),
          cpm: parseFloat(i.cpm),
          frequency: parseFloat(i.frequency),
          leads: extractActionValue(i.actions, "lead"),
          messaging_conversations_started: extractActionValue(
            i.actions,
            "onsite_conversion.messaging_conversation_started_7d",
          ),
          cost_per_lead: extractCostValue(i.cost_per_action_type, "lead"),
          outbound_clicks: extractActionValue(i.outbound_clicks, "outbound_click"),
          landing_page_views: extractActionValue(i.actions, "landing_page_view"),
          actions: i.actions ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: campaignErr } = await supabase
          .from("meta_insights_daily")
          .upsert(campaignRows, { onConflict: "org_id,level,entity_id,date" })

        if (campaignErr) throw new Error(`campaign insights upsert: ${campaignErr.message}`)
        totalRecords += campaignRows.length
        porNivel.campaign.linhas = campaignRows.length
      }

      } catch (e) { falhaDeNivel("campaign", e) }

      // --- Adset level ---
      try {
      const { data: adsetInsights, apiCalls: adsetCalls } =
        await fetchAllPages<InsightWithAdsetId>(insightsPath, token, {
          level: "adset",
          date_preset: "yesterday",
          fields: `adset_id,${INSIGHT_FIELDS_BASE}`,
        })
      totalApiCalls += adsetCalls

      if (adsetInsights.length > 0) {
        const adsetRows = adsetInsights.map((i) => ({
          org_id: account.org_id,
          level: "adset",
          entity_id: i.adset_id,
          date: i.date_start,
          spend: parseFloat(i.spend),
          impressions: parseInt(i.impressions, 10),
          reach: parseInt(i.reach, 10),
          clicks: parseInt(i.clicks, 10),
          ctr: parseFloat(i.ctr),
          cpc: parseFloat(i.cpc),
          cpm: parseFloat(i.cpm),
          frequency: parseFloat(i.frequency),
          leads: extractActionValue(i.actions, "lead"),
          messaging_conversations_started: extractActionValue(
            i.actions,
            "onsite_conversion.messaging_conversation_started_7d",
          ),
          cost_per_lead: extractCostValue(i.cost_per_action_type, "lead"),
          outbound_clicks: extractActionValue(i.outbound_clicks, "outbound_click"),
          landing_page_views: extractActionValue(i.actions, "landing_page_view"),
          actions: i.actions ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: adsetErr } = await supabase
          .from("meta_insights_daily")
          .upsert(adsetRows, { onConflict: "org_id,level,entity_id,date" })

        if (adsetErr) throw new Error(`adset insights upsert: ${adsetErr.message}`)
        totalRecords += adsetRows.length
        porNivel.adset.linhas = adsetRows.length
      }

      } catch (e) { falhaDeNivel("adset", e) }

      // --- Ad level ---
      try {
      const { data: adInsights, apiCalls: adCalls } = await fetchAllPages<InsightWithAdId>(
        insightsPath,
        token,
        {
          level: "ad",
          date_preset: "yesterday",
          fields: `ad_id,${INSIGHT_FIELDS_AD}`,
        },
      )
      totalApiCalls += adCalls

      if (adInsights.length > 0) {
        const adRows = adInsights.map((i) => ({
          org_id: account.org_id,
          level: "ad",
          entity_id: i.ad_id,
          date: i.date_start,
          spend: parseFloat(i.spend),
          impressions: parseInt(i.impressions, 10),
          reach: parseInt(i.reach, 10),
          clicks: parseInt(i.clicks, 10),
          ctr: parseFloat(i.ctr),
          cpc: parseFloat(i.cpc),
          cpm: parseFloat(i.cpm),
          frequency: parseFloat(i.frequency),
          leads: extractActionValue(i.actions, "lead"),
          messaging_conversations_started: extractActionValue(
            i.actions,
            "onsite_conversion.messaging_conversation_started_7d",
          ),
          cost_per_lead: extractCostValue(i.cost_per_action_type, "lead"),
          outbound_clicks: extractActionValue(i.outbound_clicks, "outbound_click"),
          landing_page_views: extractActionValue(i.actions, "landing_page_view"),
          quality_ranking: i.quality_ranking ?? null,
          engagement_rate_ranking: i.engagement_rate_ranking ?? null,
          conversion_rate_ranking: i.conversion_rate_ranking ?? null,
          video_metrics: buildVideoMetrics(i),
          actions: i.actions ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: adErr } = await supabase
          .from("meta_insights_daily")
          .upsert(adRows, { onConflict: "org_id,level,entity_id,date" })

        if (adErr) throw new Error(`ad insights upsert: ${adErr.message}`)
        totalRecords += adRows.length
        porNivel.ad.linhas = adRows.length
      }
      } catch (e) { falhaDeNivel("ad", e) }

      // Story 75-262 — o log agora diz O QUE entrou e QUAL nível falhou. Antes era
      // um `records_synced` único e um status binário: não havia como saber, olhando
      // o log, que só o nível de anúncio estava morto.
      const niveisComFalha = (Object.keys(porNivel) as Array<keyof typeof porNivel>).filter(
        (n) => porNivel[n].erro !== null,
      )
      const resumo = niveisComFalha.length
        ? niveisComFalha.map((n) => `${n}: ${porNivel[n].erro}`).join(" | ")
        : null

      if (syncLog) {
        await supabase
          .from("meta_sync_log")
          .update({
            finished_at: new Date().toISOString(),
            // Qualquer nível com falha mantém o run como 'error' — é o que o cron
            // de health observa. Mas `details` mostra que os outros entraram.
            status: niveisComFalha.length ? "error" : "success",
            records_synced: totalRecords,
            api_calls_made: totalApiCalls,
            error_message: resumo,
            details: porNivel,
          })
          .eq("id", syncLog.id)
      }

      console.log(
        `[META_INSIGHTS] Account ${account.id}: ${totalRecords} records (campanha ${porNivel.campaign.linhas}, conjunto ${porNivel.adset.linhas}, anúncio ${porNivel.ad.linhas}), ${totalApiCalls} API calls${resumo ? ` — FALHAS: ${resumo}` : ""}`,
      )
      results.push({
        account_id: account.id,
        status: niveisComFalha.length ? "partial" : "success",
        records_synced: totalRecords,
      })
    } catch (err) {
      if (err instanceof MetaOAuthException) {
        await supabase
          .from("meta_ad_accounts")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", account.id)

        if (syncLog) {
          await supabase
            .from("meta_sync_log")
            .update({
              finished_at: new Date().toISOString(),
              status: "error",
              error_message: "OAuth token invalid or expired",
            })
            .eq("id", syncLog.id)
        }

        console.error(`[META_INSIGHTS] Token invalid for account ${account.id}`)
        await supabase.from("meta_alerts").upsert({
          org_id: account.org_id,
          alert_type: "token_invalid",
          level: "account",
          entity_id: account.meta_account_id,
          severity: "critical",
          message: `Token Meta inválido ou expirado para a conta ${account.meta_account_id}. Acesse as configurações para renovar.`,
          fired_date: new Date().toISOString().split("T")[0],
        }, { onConflict: "org_id,alert_type,entity_id,fired_date", ignoreDuplicates: true })
        results.push({ account_id: account.id, status: "token_invalid" })
        continue
      }

      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[META_INSIGHTS] Error syncing account ${account.id}:`, errorMessage)

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

      throw err
    }
  }

  return NextResponse.json({ ok: true, accounts_synced: results.length, results })
}
