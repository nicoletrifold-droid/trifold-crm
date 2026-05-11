import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

const DEFAULTS = {
  sender_name: "Trifold",
  sender_email: "contato@trifold.com.br",
  reply_to: null,
  daily_quota: 100,
  quota_alert_pct: 95,
  bounce_alert_pct: 5,
  telegram_alerts_enabled: true,
  unsubscribe_base_url: null,
}

export async function GET() {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from("email_settings")
    .select("*")
    .eq("org_id", user.orgId)
    .maybeSingle()

  return NextResponse.json(data ?? { ...DEFAULTS, org_id: user.orgId })
}

export async function PUT(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json()) as Partial<typeof DEFAULTS>

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("email_settings")
    .upsert(
      {
        org_id: user.orgId,
        sender_name: body.sender_name ?? DEFAULTS.sender_name,
        sender_email: body.sender_email ?? DEFAULTS.sender_email,
        reply_to: body.reply_to ?? null,
        daily_quota: body.daily_quota ?? DEFAULTS.daily_quota,
        quota_alert_pct: body.quota_alert_pct ?? DEFAULTS.quota_alert_pct,
        bounce_alert_pct: body.bounce_alert_pct ?? DEFAULTS.bounce_alert_pct,
        telegram_alerts_enabled: body.telegram_alerts_enabled ?? DEFAULTS.telegram_alerts_enabled,
        unsubscribe_base_url: body.unsubscribe_base_url ?? null,
      },
      { onConflict: "org_id" }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
