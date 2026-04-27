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
}

interface InsightWithCampaignId extends InsightBase {
  campaign_id: string
}

interface InsightWithAdsetId extends InsightBase {
  adset_id: string
}

interface InsightWithAdId extends InsightBase {
  ad_id: string
}

const INSIGHT_FIELDS = [
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
  "date_start",
  "date_stop",
].join(",")

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

    try {
      const token = account.access_token
      const accountPath = account.meta_account_id
      const insightsPath = `${accountPath}/insights`

      // --- Campaign level ---
      const { data: campaignInsights, apiCalls: campaignCalls } =
        await fetchAllPages<InsightWithCampaignId>(insightsPath, token, {
          level: "campaign",
          date_preset: "yesterday",
          fields: `campaign_id,${INSIGHT_FIELDS}`,
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
          actions: i.actions ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: campaignErr } = await supabase
          .from("meta_insights_daily")
          .upsert(campaignRows, { onConflict: "org_id,level,entity_id,date" })

        if (campaignErr) throw new Error(`campaign insights upsert: ${campaignErr.message}`)
        totalRecords += campaignRows.length
      }

      // --- Adset level ---
      const { data: adsetInsights, apiCalls: adsetCalls } =
        await fetchAllPages<InsightWithAdsetId>(insightsPath, token, {
          level: "adset",
          date_preset: "yesterday",
          fields: `adset_id,${INSIGHT_FIELDS}`,
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
          actions: i.actions ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: adsetErr } = await supabase
          .from("meta_insights_daily")
          .upsert(adsetRows, { onConflict: "org_id,level,entity_id,date" })

        if (adsetErr) throw new Error(`adset insights upsert: ${adsetErr.message}`)
        totalRecords += adsetRows.length
      }

      // --- Ad level ---
      const { data: adInsights, apiCalls: adCalls } = await fetchAllPages<InsightWithAdId>(
        insightsPath,
        token,
        {
          level: "ad",
          date_preset: "yesterday",
          fields: `ad_id,${INSIGHT_FIELDS}`,
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
          actions: i.actions ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: adErr } = await supabase
          .from("meta_insights_daily")
          .upsert(adRows, { onConflict: "org_id,level,entity_id,date" })

        if (adErr) throw new Error(`ad insights upsert: ${adErr.message}`)
        totalRecords += adRows.length
      }

      if (syncLog) {
        await supabase
          .from("meta_sync_log")
          .update({
            finished_at: new Date().toISOString(),
            status: "success",
            records_synced: totalRecords,
            api_calls_made: totalApiCalls,
          })
          .eq("id", syncLog.id)
      }

      console.log(
        `[META_INSIGHTS] Account ${account.id}: ${totalRecords} records, ${totalApiCalls} API calls`,
      )
      results.push({ account_id: account.id, status: "success", records_synced: totalRecords })
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
