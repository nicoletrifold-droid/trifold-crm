import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const ENTITIES_STALE_HOURS = 6
const INSIGHTS_STALE_HOURS = 26

type CheckStatus = "ok" | "stale" | "error"

interface SyncCheck {
  status: CheckStatus
  last_success_at: string | null
  hours_since_sync: number | null
}

interface TokenCheck {
  status: "ok" | "error"
  accounts_with_error: number
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function hoursSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60))
}

export async function GET() {
  const supabase = createAdminClient()

  // Entities sync check
  const { data: lastEntities } = await supabase
    .from("meta_sync_log")
    .select("finished_at")
    .eq("sync_type", "entities")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const entitiesLastAt = lastEntities?.finished_at ?? null
  const entitiesStale = !entitiesLastAt || entitiesLastAt < hoursAgo(ENTITIES_STALE_HOURS)
  const entitiesCheck: SyncCheck = {
    status: !entitiesLastAt ? "error" : entitiesStale ? "stale" : "ok",
    last_success_at: entitiesLastAt,
    hours_since_sync: entitiesLastAt ? hoursSince(entitiesLastAt) : null,
  }

  // Insights sync check
  const { data: lastInsights } = await supabase
    .from("meta_sync_log")
    .select("finished_at")
    .eq("sync_type", "insights")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const insightsLastAt = lastInsights?.finished_at ?? null
  const insightsStale = !insightsLastAt || insightsLastAt < hoursAgo(INSIGHTS_STALE_HOURS)
  const insightsCheck: SyncCheck = {
    status: !insightsLastAt ? "error" : insightsStale ? "stale" : "ok",
    last_success_at: insightsLastAt,
    hours_since_sync: insightsLastAt ? hoursSince(insightsLastAt) : null,
  }

  // Token status check
  const { data: errorAccounts } = await supabase
    .from("meta_ad_accounts")
    .select("id")
    .eq("status", "error")

  const accountsWithError = errorAccounts?.length ?? 0
  const tokenCheck: TokenCheck = {
    status: accountsWithError > 0 ? "error" : "ok",
    accounts_with_error: accountsWithError,
  }

  // Overall status
  const hasError =
    entitiesCheck.status === "error" ||
    insightsCheck.status === "error" ||
    tokenCheck.status === "error"
  const hasDegraded =
    entitiesCheck.status === "stale" || insightsCheck.status === "stale"

  const overallStatus = hasError ? "error" : hasDegraded ? "degraded" : "healthy"

  return NextResponse.json(
    {
      status: overallStatus,
      checks: {
        entities_sync: entitiesCheck,
        insights_sync: insightsCheck,
        token_status: tokenCheck,
      },
      timestamp: new Date().toISOString(),
    },
    { status: overallStatus === "healthy" ? 200 : 503 }
  )
}
