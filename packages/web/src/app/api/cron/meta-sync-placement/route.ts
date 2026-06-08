import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { metaFetch, MetaOAuthException } from "@trifold/shared"
import type { MetaPagedResponse } from "@trifold/shared"

const CRON_SECRET = process.env.CRON_SECRET

// ─── Types ─────────────────────────────────────────────────────────────────

interface MetaAction {
  action_type: string
  value: string
}

interface PlacementInsightRow {
  campaign_id: string
  adset_id: string
  spend: string
  impressions: string
  clicks: string
  publisher_platform: string
  platform_position: string
  actions?: MetaAction[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractActionValue(arr: MetaAction[] | undefined, type: string): number {
  return Math.round(parseFloat(arr?.find((a) => a.action_type === type)?.value ?? "0"))
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
      params: { ...params, ...(cursor ? { after: cursor } : {}), limit: "200" },
    })
    apiCalls++
    results.push(...response.data)
    cursor = response.paging?.next ? response.paging.cursors.after : undefined
  } while (cursor)

  return { data: results, apiCalls }
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[META_PLACEMENT] CRON_SECRET not configured")
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
    return NextResponse.json({ error: accountsError.message }, { status: 500 })
  }
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, accounts_synced: 0 })
  }

  const results: Array<{ account_id: string; status: string; records_synced?: number }> = []

  for (const account of accounts) {
    if (!account.access_token) {
      results.push({ account_id: account.id, status: "skipped_no_token" })
      continue
    }

    const { data: syncLog } = await supabase
      .from("meta_sync_log")
      .insert({
        org_id: account.org_id,
        sync_type: "placement",
        started_at: new Date().toISOString(),
        status: "running",
      })
      .select("id")
      .single()

    try {
      const token = account.access_token
      const insightsPath = `${account.meta_account_id}/insights`

      const { data: rows, apiCalls } = await fetchAllPages<PlacementInsightRow>(
        insightsPath,
        token,
        {
          level: "adset",
          date_preset: "last_7d",
          breakdowns: "publisher_platform,platform_position",
          fields: "campaign_id,adset_id,spend,impressions,clicks,actions,publisher_platform,platform_position",
        },
      )

      // Aggregate by (campaign_id, adset_id, date, publisher_platform, platform_position)
      // date_preset=last_7d returns one row per adset+breakdown (no per-day breakdown)
      // We store with a single date = today minus 7d range start
      const today = new Date().toISOString().split("T")[0]!

      const placementRows = rows.map((r) => ({
        org_id: account.org_id,
        campaign_id: r.campaign_id,
        adset_id: r.adset_id ?? null,
        date: today,
        publisher_platform: r.publisher_platform,
        platform_position: r.platform_position,
        spend: parseFloat(r.spend ?? "0"),
        impressions: parseInt(r.impressions ?? "0", 10),
        clicks: parseInt(r.clicks ?? "0", 10),
        leads: extractActionValue(r.actions, "lead"),
        synced_at: new Date().toISOString(),
      }))

      if (placementRows.length > 0) {
        const { error: upsertErr } = await supabase
          .from("meta_insights_placement_daily")
          .upsert(placementRows, {
            onConflict: "org_id,campaign_id,date,publisher_platform,platform_position",
          })

        if (upsertErr) throw new Error(`placement upsert: ${upsertErr.message}`)
      }

      if (syncLog) {
        await supabase.from("meta_sync_log")
          .update({
            finished_at: new Date().toISOString(),
            status: "success",
            records_synced: placementRows.length,
            api_calls_made: apiCalls,
          })
          .eq("id", syncLog.id)
      }

      console.log(`[META_PLACEMENT] Account ${account.id}: ${placementRows.length} records, ${apiCalls} API calls`)
      results.push({ account_id: account.id, status: "success", records_synced: placementRows.length })
    } catch (err) {
      if (err instanceof MetaOAuthException) {
        await supabase
          .from("meta_ad_accounts")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", account.id)

        const fired_date = new Date().toISOString().split("T")[0]!
        await supabase.from("meta_alerts").upsert({
          org_id: account.org_id,
          alert_type: "token_invalid",
          level: "account",
          entity_id: account.meta_account_id,
          severity: "critical",
          message: `Token Meta inválido para a conta ${account.meta_account_id}. Sync de posicionamento interrompido.`,
          fired_date,
        }, { onConflict: "org_id,alert_type,entity_id,fired_date", ignoreDuplicates: true })

        if (syncLog) {
          await supabase.from("meta_sync_log")
            .update({ finished_at: new Date().toISOString(), status: "error", error_message: "OAuth token invalid" })
            .eq("id", syncLog.id)
        }
        results.push({ account_id: account.id, status: "token_invalid" })
        continue
      }

      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[META_PLACEMENT] Error syncing account ${account.id}:`, errorMessage)

      if (syncLog) {
        await supabase.from("meta_sync_log")
          .update({ finished_at: new Date().toISOString(), status: "error", error_message: errorMessage })
          .eq("id", syncLog.id)
      }
      throw err
    }
  }

  return NextResponse.json({ ok: true, accounts_synced: results.length, results })
}
