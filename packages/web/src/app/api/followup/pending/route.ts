import { NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "alertas.followup_ver")
  if (roleError) return roleError

  const { data: logs, error } = await supabase
    .from("follow_up_log")
    .select(
      `
      id, type, status, scheduled_at, sent_at, message, created_at,
      lead:leads!lead_id(id, name, phone, stage_id),
      rule:follow_up_rules!rule_id(
        id, alert_days, nicole_takeover_days,
        stage:kanban_stages!stage_id(id, name, color)
      )
    `
    )
    .eq("org_id", appUser.org_id)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: logs })
}
