import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"
import { deleteCalendarEvent } from "@web/lib/google-calendar"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: appointment, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      lead:leads!lead_id(id, name, phone, email),
      broker:users!broker_id(id, name, email, avatar_url),
      property:properties!property_id(id, name)
    `
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (error || !appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 }
    )
  }

  return NextResponse.json({ data: appointment })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const body = await request.json()

  // Fetch current appointment to get google_event_id before updating
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, google_event_id, lead_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  const { fields: updateFields, error: payloadError } = buildUpdatePayload(body, [
    "scheduled_at",
    "duration_minutes",
    "location",
    "status",
    "notes",
    "broker_id",
    "property_id",
  ])

  if (payloadError) return payloadError

  const { data: appointment, error } = await supabase
    .from("appointments")
    .update(updateFields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error || !appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 }
    )
  }

  // If status changed to cancelled, remove Google Calendar event
  if (body.status === "cancelled" && existing.google_event_id) {
    await deleteCalendarEvent(existing.google_event_id)
  }

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: appointment.lead_id,
    user_id: appUser.id,
    type: "appointment_updated",
    description: `Agendamento atualizado`,
    metadata: {
      appointment_id: appointment.id,
      updated_fields: Object.keys(updateFields),
    },
  })

  return NextResponse.json({ data: appointment })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Fetch current appointment to get google_event_id before soft-deleting
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, google_event_id, lead_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  // Soft delete: set status to cancelled
  const { data: appointment, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error || !appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 }
    )
  }

  // Delete Google Calendar event if present
  if (existing.google_event_id) {
    await deleteCalendarEvent(existing.google_event_id)
  }

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: appointment.lead_id,
    user_id: appUser.id,
    type: "appointment_cancelled",
    description: `Agendamento cancelado`,
    metadata: { appointment_id: appointment.id },
  })

  return NextResponse.json({ data: { message: "Appointment cancelled" } })
}
