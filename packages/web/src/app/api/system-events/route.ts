import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"

// Shape returned by RPC get_system_events_summary (Story 30.8)
// bigint fields arrive as string from PostgREST; numeric fields may arrive as string or number
type SystemEventsSummary = {
  errors_24h: number | string
  messages_24h: number | string
  avg_claude_response_ms: number | string | null
  rag_total_24h: number | string
  rag_fallbacks_24h: number | string
  health_bot_errors_30m: number | string
  health_bot_warns_30m: number | string
  health_ai_errors_30m: number | string
  health_ai_warns_30m: number | string
  health_webhook_errors_30m: number | string
  health_webhook_warns_30m: number | string
  health_cron_errors_30m: number | string
  health_cron_warns_30m: number | string
}

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  return typeof v === "number" ? v : Number(v)
}

const status = (errors: number, warns: number): "green" | "yellow" | "red" => {
  if (errors > 3) return "red"
  if (warns > 0) return "yellow"
  return "green"
}

const emptySummary: SystemEventsSummary = {
  errors_24h: 0,
  messages_24h: 0,
  avg_claude_response_ms: null,
  rag_total_24h: 0,
  rag_fallbacks_24h: 0,
  health_bot_errors_30m: 0,
  health_bot_warns_30m: 0,
  health_ai_errors_30m: 0,
  health_ai_warns_30m: 0,
  health_webhook_errors_30m: 0,
  health_webhook_warns_30m: 0,
  health_cron_errors_30m: 0,
  health_cron_warns_30m: 0,
}

export async function GET(request: NextRequest) {
  const user = await getServerUser()

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = await createClient()
  const { searchParams } = request.nextUrl

  const level = searchParams.get("level")
  const category = searchParams.get("category")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200)

  // Query 1: recent events (rows). Preserved as-is — RPC handles aggregates only.
  let query = supabase
    .from("system_events")
    .select("*")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (level) query = query.eq("level", level)
  if (category) query = query.eq("category", category)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Single RPC replaces 13 sequential count/aggregate queries (Story 30.8).
  const { data: summaryRaw, error: summaryError } = await supabase.rpc(
    "get_system_events_summary",
    { p_org_id: user.orgId, p_window_hours: 24 }
  )

  if (summaryError) {
    console.error("[SYSTEM_EVENTS] RPC get_system_events_summary failed", summaryError)
  }

  const s: SystemEventsSummary =
    (summaryRaw as SystemEventsSummary | null) ?? emptySummary

  // Derive health per category in TS (mirrors pre-refactor logic).
  const health: Record<string, "green" | "yellow" | "red"> = {
    bot: status(num(s.health_bot_errors_30m), num(s.health_bot_warns_30m)),
    ai: status(num(s.health_ai_errors_30m), num(s.health_ai_warns_30m)),
    webhook: status(num(s.health_webhook_errors_30m), num(s.health_webhook_warns_30m)),
    cron: status(num(s.health_cron_errors_30m), num(s.health_cron_warns_30m)),
  }

  // Derive rag_fallback_rate in TS (matches previous behaviour).
  const ragTotal = num(s.rag_total_24h)
  const ragFallbacks = num(s.rag_fallbacks_24h)
  const ragFallbackRate = ragTotal > 0 ? Math.round((ragFallbacks / ragTotal) * 100) : 0

  // avg_claude_response_ms: round when present, null otherwise (preserves contract).
  const avgClaudeResponseMs =
    s.avg_claude_response_ms != null ? Math.round(num(s.avg_claude_response_ms)) : null

  return NextResponse.json({
    data,
    metrics: {
      errors_24h: num(s.errors_24h),
      messages_24h: num(s.messages_24h),
      avg_claude_response_ms: avgClaudeResponseMs,
      rag_fallback_rate: ragFallbackRate,
    },
    health,
  })
}
