import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Cron: Keep Supabase project active (prevent free-tier pause).
 * GET /api/cron/keep-alive
 * Schedule: 0 8 * * * (daily at 08:00 UTC)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[KEEP_ALIVE] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const start = Date.now()
    const { error } = await supabase.from("organizations").select("id").limit(1)
    const latency = Date.now() - start

    if (error) {
      console.error("[KEEP_ALIVE] Supabase ping failed:", error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    console.log(`[KEEP_ALIVE] Supabase ping ok — ${latency}ms`)
    return NextResponse.json({ ok: true, latency_ms: latency })
  } catch (err) {
    console.error("[KEEP_ALIVE] Unexpected error:", err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
