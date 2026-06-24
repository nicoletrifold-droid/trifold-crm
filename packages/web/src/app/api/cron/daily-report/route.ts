import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { buildDailyLeadsReport } from "@web/lib/reports/daily-leads-report"
import { sendDailyReport } from "@web/lib/reports/send-daily-report"

// Story 75-45 — relatório diário de leads via WhatsApp (diretor).
// Agendado no vercel.json para 10:59 UTC = 07:59 BRT (antes da roleta reabrir
// às 08:00, fechando o dia anterior). Destinatários e org via env.
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001" // Trifold Engenharia

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const recipients = (process.env.DAILY_REPORT_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (recipients.length === 0) {
    return NextResponse.json({ skipped: "DAILY_REPORT_RECIPIENTS vazio" })
  }

  const orgId = process.env.DAILY_REPORT_ORG_ID ?? DEFAULT_ORG_ID
  const admin = createAdminClient()

  try {
    const vars = await buildDailyLeadsReport(admin, orgId)
    const result = await sendDailyReport(admin, orgId, recipients, vars)
    if (result.errors.length > 0) {
      console.error("[daily-report] erros de envio:", result.errors)
    }
    return NextResponse.json({ ok: true, vars, ...result })
  } catch (e) {
    console.error("[daily-report] falha:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
