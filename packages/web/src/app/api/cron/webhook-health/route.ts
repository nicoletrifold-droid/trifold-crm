import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTelegramAdminAlert } from "@web/lib/telegram"

const CRON_SECRET = process.env.CRON_SECRET
const SILENCE_THRESHOLD_MINUTES = 30

function isBusinessHoursBRT(): boolean {
  // BRT = UTC-3 — horário comercial 08h–20h BRT = 11h–23h UTC
  const hourUTC = new Date().getUTCHours()
  return hourUTC >= 11 && hourUTC < 23
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[WEBHOOK_HEALTH] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isBusinessHoursBRT()) {
    return NextResponse.json({ ok: true, skipped: "outside_business_hours" })
  }

  const supabase = createAdminClient()
  const thresholdTime = new Date(
    Date.now() - SILENCE_THRESHOLD_MINUTES * 60 * 1000,
  ).toISOString()

  const { data: lastEvent, error } = await supabase
    .from("webhook_logs")
    .select("id, created_at")
    .eq("source", "meta_ads")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("[WEBHOOK_HEALTH] Failed to query webhook_logs:", error.message)
    return NextResponse.json({ ok: true, error: error.message })
  }

  const noEventsAtAll = !lastEvent
  const silenceDetected = noEventsAtAll || lastEvent.created_at < thresholdTime

  if (silenceDetected) {
    const lastSeen = noEventsAtAll ? "nunca" : new Date(lastEvent.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const alertMessage = `⚠️ *Trifold CRM — Alerta de Integração*\n\nNenhum webhook Meta Ads recebido nos últimos ${SILENCE_THRESHOLD_MINUTES} minutos.\n\nÚltimo evento: ${lastSeen}\n\nVerifique a integração Meta Ads no dashboard.`

    console.warn(`[WEBHOOK_HEALTH] Meta Ads silence detected — last event: ${lastSeen}`)
    await sendTelegramAdminAlert(alertMessage)

    return NextResponse.json({
      ok: true,
      alert_sent: true,
      last_event_at: lastEvent?.created_at ?? null,
    })
  }

  return NextResponse.json({
    ok: true,
    alert_sent: false,
    last_event_at: lastEvent.created_at,
  })
}
