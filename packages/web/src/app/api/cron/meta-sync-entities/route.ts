import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { metaFetch, MetaOAuthException } from "@trifold/shared"
import type { MetaCampaign, MetaAdSet, MetaAd, MetaPagedResponse } from "@trifold/shared"

const CRON_SECRET = process.env.CRON_SECRET

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
    console.error("[META_SYNC] CRON_SECRET not configured")
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
    console.error("[META_SYNC] Failed to fetch ad accounts:", accountsError.message)
    return NextResponse.json({ error: accountsError.message }, { status: 500 })
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, accounts_synced: 0 })
  }

  const results: Array<{ account_id: string; status: string; records_synced?: number }> = []

  for (const account of accounts) {
    if (!account.access_token) {
      console.warn(`[META_SYNC] Account ${account.id} has no token — skipping`)
      results.push({ account_id: account.id, status: "skipped_no_token" })
      continue
    }

    const { data: syncLog } = await supabase
      .from("meta_sync_log")
      .insert({
        org_id: account.org_id,
        sync_type: "entities",
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

      // --- Sync Campaigns ---
      const { data: campaigns, apiCalls: campaignCalls } = await fetchAllPages<MetaCampaign>(
        `${accountPath}/campaigns`,
        token,
        { fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time" },
      )
      totalApiCalls += campaignCalls

      if (campaigns.length > 0) {
        const campaignRows = campaigns.map((c) => ({
          org_id: account.org_id,
          account_id: account.id,
          meta_campaign_id: c.id,
          name: c.name,
          objective: c.objective,
          status: c.status,
          daily_budget: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
          lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget, 10) : null,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
          synced_at: new Date().toISOString(),
        }))

        const { error: campaignErr } = await supabase
          .from("meta_campaigns")
          .upsert(campaignRows, { onConflict: "org_id,meta_campaign_id" })

        if (campaignErr) throw new Error(`campaigns upsert: ${campaignErr.message}`)
        totalRecords += campaigns.length
      }

      // Build campaign lookup: meta_campaign_id → internal UUID
      const { data: dbCampaigns } = await supabase
        .from("meta_campaigns")
        .select("id, meta_campaign_id")
        .eq("org_id", account.org_id)

      const campaignMap = new Map(dbCampaigns?.map((c) => [c.meta_campaign_id, c.id]) ?? [])

      // --- Sync AdSets ---
      const { data: adsets, apiCalls: adsetCalls } = await fetchAllPages<MetaAdSet>(
        `${accountPath}/adsets`,
        token,
        { fields: "id,name,campaign_id,status,optimization_goal,daily_budget" },
      )
      totalApiCalls += adsetCalls

      if (adsets.length > 0) {
        const adsetRows = adsets
          .map((a) => {
            const campaign_id = campaignMap.get(a.campaign_id)
            if (!campaign_id) return null
            return {
              org_id: account.org_id,
              campaign_id,
              meta_adset_id: a.id,
              name: a.name,
              status: a.status,
              optimization_goal: a.optimization_goal ?? null,
              daily_budget: a.daily_budget ? parseInt(a.daily_budget, 10) : null,
              synced_at: new Date().toISOString(),
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        if (adsetRows.length > 0) {
          const { error: adsetErr } = await supabase
            .from("meta_adsets")
            .upsert(adsetRows, { onConflict: "org_id,meta_adset_id" })

          if (adsetErr) throw new Error(`adsets upsert: ${adsetErr.message}`)
          totalRecords += adsetRows.length
        }
      }

      // Build adset lookup: meta_adset_id → internal UUID
      const { data: dbAdsets } = await supabase
        .from("meta_adsets")
        .select("id, meta_adset_id")
        .eq("org_id", account.org_id)

      const adsetMap = new Map(dbAdsets?.map((a) => [a.meta_adset_id, a.id]) ?? [])

      // --- Sync Ads ---
      const { data: ads, apiCalls: adCalls } = await fetchAllPages<MetaAd>(
        `${accountPath}/ads`,
        token,
        { fields: "id,name,adset_id,status,creative" },
      )
      totalApiCalls += adCalls

      if (ads.length > 0) {
        const adRows = ads
          .map((a) => {
            const adset_id = adsetMap.get(a.adset_id)
            if (!adset_id) return null
            return {
              org_id: account.org_id,
              adset_id,
              meta_ad_id: a.id,
              name: a.name,
              status: a.status,
              creative: a.creative ?? null,
              synced_at: new Date().toISOString(),
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        if (adRows.length > 0) {
          const { error: adErr } = await supabase
            .from("meta_ads")
            .upsert(adRows, { onConflict: "org_id,meta_ad_id" })

          if (adErr) throw new Error(`ads upsert: ${adErr.message}`)
          totalRecords += adRows.length
        }
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
        `[META_SYNC] Account ${account.id}: ${totalRecords} records, ${totalApiCalls} API calls`,
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

        console.error(`[META_SYNC] Token invalid for account ${account.id}`)
        results.push({ account_id: account.id, status: "token_invalid" })
        continue
      }

      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[META_SYNC] Error syncing account ${account.id}:`, errorMessage)

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
