import { NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTelegramAdminAlert } from "@web/lib/telegram"
import { logEvent } from "@web/lib/logger"

function getStartOfDayBRT(): Date {
  const now = new Date()
  const start = new Date(now)
  start.setUTCHours(3, 0, 0, 0)
  if (now.getUTCHours() < 3) start.setUTCDate(start.getUTCDate() - 1)
  return start
}

async function wasAlertSentRecently(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  alertType: string
): Promise<boolean> {
  const h1ago = new Date(Date.now() - 60 * 60 * 1000)
  const { data } = await supabase
    .from("system_events")
    .select("id")
    .eq("org_id", orgId)
    .eq("event_type", `email_alert_${alertType}`)
    .gte("created_at", h1ago.toISOString())
    .limit(1)
    .maybeSingle()
  return !!data
}

async function checkAndSendAlerts({
  orgId,
  supabase,
  sentToday,
  bounceRate2h,
  bounced2h,
}: {
  orgId: string
  supabase: ReturnType<typeof createAdminClient>
  sentToday: number
  bounceRate2h: number
  bounced2h: number
}) {
  if (sentToday >= 100) {
    if (!(await wasAlertSentRecently(supabase, orgId, "quota_full"))) {
      await sendTelegramAdminAlert(
        `🔴 Email quota atingida (${sentToday}/100) — envios bloqueados até meia-noite BRT`
      )
      logEvent({
        level: "warn",
        category: "system",
        event_type: "email_alert_quota_full",
        org_id: orgId,
        message: `Email quota atingida (${sentToday}/100)`,
        metadata: { sent_today: sentToday },
      })
    }
  } else if (sentToday >= 90) {
    if (!(await wasAlertSentRecently(supabase, orgId, "quota_high"))) {
      await sendTelegramAdminAlert(`⚠️ Email quota: ${sentToday}/100 emails enviados hoje`)
      logEvent({
        level: "warn",
        category: "system",
        event_type: "email_alert_quota_high",
        org_id: orgId,
        message: `Email quota alta: ${sentToday}/100`,
        metadata: { sent_today: sentToday },
      })
    }
  }

  // Require at least 3 bounces to avoid false positives on small volumes
  if (bounceRate2h > 5 && bounced2h >= 3) {
    if (!(await wasAlertSentRecently(supabase, orgId, "bounce_high"))) {
      await sendTelegramAdminAlert(
        `⚠️ Alta taxa de bounce: ${bounceRate2h.toFixed(1)}% nas últimas 2h`
      )
      logEvent({
        level: "warn",
        category: "system",
        event_type: "email_alert_bounce_high",
        org_id: orgId,
        message: `Alta taxa de bounce: ${bounceRate2h.toFixed(1)}%`,
        metadata: { bounce_rate: bounceRate2h, bounced_2h: bounced2h },
      })
    }
  }
}

export async function GET() {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabase = createAdminClient()
  const now = new Date()
  const dayStart = getStartOfDayBRT()
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const h2ago = new Date(now.getTime() - 2 * 60 * 60 * 1000)

  const [sentRes, deliveredRes, openedRes, bounced24Res, sent2hRes, bounced2hRes, alertsRes] =
    await Promise.all([
      supabase
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .neq("status", "failed")
        .gte("sent_at", dayStart.toISOString()),

      supabase
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .in("status", ["delivered", "opened", "clicked"])
        .gte("sent_at", dayStart.toISOString()),

      supabase
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .in("status", ["opened", "clicked"])
        .gte("sent_at", dayStart.toISOString()),

      supabase
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("status", "bounced")
        .gte("bounced_at", h24ago.toISOString()),

      supabase
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .neq("status", "failed")
        .gte("sent_at", h2ago.toISOString()),

      supabase
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("status", "bounced")
        .gte("bounced_at", h2ago.toISOString()),

      supabase
        .from("system_events")
        .select("id, event_type, message, created_at")
        .eq("org_id", user.orgId)
        .like("event_type", "email_alert_%")
        .order("created_at", { ascending: false })
        .limit(5),
    ])

  const sentToday = sentRes.count ?? 0
  const deliveredToday = deliveredRes.count ?? 0
  const openedToday = openedRes.count ?? 0
  const bounced24h = bounced24Res.count ?? 0
  const sent2h = sent2hRes.count ?? 0
  const bounced2h = bounced2hRes.count ?? 0

  const deliveryRate = sentToday > 0 ? Math.round((deliveredToday / sentToday) * 100) : 0
  const openRate = deliveredToday > 0 ? Math.round((openedToday / deliveredToday) * 100) : 0
  const bounceRate2h = sent2h > 0 ? (bounced2h / sent2h) * 100 : 0

  await checkAndSendAlerts({ orgId: user.orgId, supabase, sentToday, bounceRate2h, bounced2h })

  const alertSeverity: Record<string, "red" | "orange" | "yellow"> = {
    email_alert_quota_full: "red",
    email_alert_bounce_high: "orange",
    email_alert_quota_high: "yellow",
  }

  const alerts = (alertsRes.data ?? []).map((a) => ({
    id: a.id,
    type: a.event_type,
    message: a.message,
    severity: alertSeverity[a.event_type] ?? "yellow",
    created_at: a.created_at,
  }))

  return NextResponse.json({
    sent_today: sentToday,
    delivered_today: deliveredToday,
    opened_today: openedToday,
    bounced_24h: bounced24h,
    quota_limit: 100,
    delivery_rate: deliveryRate,
    open_rate: openRate,
    bounce_rate_2h: bounceRate2h,
    alerts,
  })
}
