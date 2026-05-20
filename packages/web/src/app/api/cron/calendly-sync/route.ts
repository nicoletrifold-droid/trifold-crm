import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  fetchScheduledEvents,
  fetchEventInvitees,
} from "@web/lib/calendly"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[CALENDLY-SYNC] CRON_SECRET not configured — endpoint blocked")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const pat = process.env.CALENDLY_PAT
  const userUri = process.env.CALENDLY_USER_URI
  if (!pat || !userUri) {
    return NextResponse.json({ skipped: true, reason: "not_configured" })
  }

  const now = new Date()
  const minStartTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const maxStartTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  let synced = 0
  let skipped = 0
  let cancelled = 0
  let errors = 0

  const supabase = createAdminClient()

  // Fetch org_id — use first org (single-tenant per PAT)
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("id")
    .limit(1)
    .single()

  if (!orgRow) {
    console.error("[CALENDLY-SYNC] No organization found")
    return NextResponse.json({ error: "No organization found" }, { status: 500 })
  }

  const orgId = orgRow.id

  let events
  try {
    events = await fetchScheduledEvents(pat, userUri, minStartTime, maxStartTime)
  } catch (err) {
    console.error("[CALENDLY-SYNC] Failed to fetch events:", err)
    return NextResponse.json({ error: "Failed to fetch Calendly events" }, { status: 500 })
  }

  for (const event of events) {
    try {
      const invitees = await fetchEventInvitees(pat, event.uri)
      const invitee = invitees[0]

      if (!invitee?.email) {
        skipped++
        continue
      }

      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("org_id", orgId)
        .eq("email", invitee.email)
        .maybeSingle()

      if (!lead) {
        skipped++
        continue
      }

      const startMs = new Date(event.start_time).getTime()
      const endMs = new Date(event.end_time).getTime()
      const durationMinutes = Math.round((endMs - startMs) / 60000)
      const status = event.status === "canceled" ? "cancelled" : "scheduled"

      await supabase.from("appointments").upsert(
        {
          org_id: orgId,
          lead_id: lead.id,
          scheduled_at: event.start_time,
          duration_minutes: durationMinutes,
          location: event.name || "Calendly",
          status,
          created_by: "admin",
          notes: `Agendado via Calendly — ${invitee.email}`,
          broker_id: null,
          property_id: null,
          calendly_event_uri: event.uri,
        },
        { onConflict: "calendly_event_uri" }
      )

      if (status === "cancelled") {
        cancelled++
      } else {
        synced++
      }
    } catch (err) {
      console.error(`[CALENDLY-SYNC] Error processing event ${event.uri}:`, err)
      errors++
    }
  }

  console.log(
    `[CALENDLY-SYNC] Done — synced: ${synced}, cancelled: ${cancelled}, skipped: ${skipped}, errors: ${errors}`
  )

  return NextResponse.json({ synced, cancelled, skipped, errors })
}
