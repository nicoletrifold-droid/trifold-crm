import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

const HHMM = /^\d{2}:\d{2}(:\d{2})?$/

/** Agenda por dia (Story 75-59). GET = 7 linhas; PATCH = upsert das 7 linhas. */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("roleta_schedule")
    .select("weekday, is_open, open_time, close_time")
    .eq("org_id", appUser.org_id)
    .order("weekday")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (await requireCapability(appUser, "roleta.configurar")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const days = body && Array.isArray(body.days) ? body.days : null
  if (!days || days.length === 0) {
    return NextResponse.json({ error: "Invalid body: days[] required" }, { status: 400 })
  }

  const rows: Array<{ org_id: string; weekday: number; is_open: boolean; open_time: string; close_time: string }> = []
  for (const d of days) {
    const weekday = Number(d?.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "Invalid weekday" }, { status: 400 })
    }
    const open = String(d?.open ?? "")
    const close = String(d?.close ?? "")
    if (!HHMM.test(open) || !HHMM.test(close)) {
      return NextResponse.json({ error: "Invalid open/close (HH:MM)" }, { status: 400 })
    }
    rows.push({
      org_id: appUser.org_id,
      weekday,
      is_open: Boolean(d?.is_open),
      open_time: open,
      close_time: close,
    })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("roleta_schedule").upsert(rows, { onConflict: "org_id,weekday" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
