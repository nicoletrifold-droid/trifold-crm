import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { deleteCalendarEvent } from "@web/lib/google-calendar"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: appointment, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      scheduled_at,
      duration_minutes,
      location,
      status,
      client_name,
      client_email,
      client_phone,
      cancel_token,
      property:properties!property_id(id, name)
    `
    )
    .eq("cancel_token", token)
    .single()

  if (error || !appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  return NextResponse.json({ data: appointment })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createAdminClient()

  // Fetch appointment to get google_event_id and current status
  const { data: appointment, error: fetchError } = await supabase
    .from("appointments")
    .select("id, status, google_event_id")
    .eq("cancel_token", token)
    .single()

  if (fetchError || !appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  if (appointment.status === "cancelled") {
    return NextResponse.json({ ok: true, message: "Already cancelled" })
  }

  const { error: updateError } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("cancel_token", token)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Delete Google Calendar event if it exists
  if (appointment.google_event_id) {
    await deleteCalendarEvent(appointment.google_event_id)
  }

  return NextResponse.json({ ok: true })
}
