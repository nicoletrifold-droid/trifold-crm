import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

function getServiceClient() {
  return createAdminClient()
}

/**
 * GET /api/appointments/reminders
 * Returns appointments scheduled in the next 24 hours that haven't been reminded yet.
 */
export async function GET() {
  try {
    const supabase = getServiceClient()

    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(
        `
        id, scheduled_at, duration_minutes, location, status, notes,
        lead:leads!lead_id(id, name, phone),
        broker:users!broker_id(id, name, email),
        property:properties!property_id(id, name),
        metadata
      `
      )
      .eq("status", "scheduled")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", in24h.toISOString())
      .or("metadata->reminded.is.null,metadata->reminded.eq.false")
      .order("scheduled_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: appointments })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/appointments/reminders
 * Marks an appointment as reminded (sets metadata.reminded = true).
 * Body: { appointment_id: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = getServiceClient()
    const body = await request.json()

    if (!body.appointment_id) {
      return NextResponse.json(
        { error: "appointment_id is required" },
        { status: 400 }
      )
    }

    // Get current appointment to preserve existing metadata
    const { data: existing, error: fetchError } = await supabase
      .from("appointments")
      .select("metadata")
      .eq("id", body.appointment_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      )
    }

    const updatedMetadata = {
      ...(existing.metadata as Record<string, unknown> || {}),
      reminded: true,
      reminded_at: new Date().toISOString(),
    }

    const { data: appointment, error } = await supabase
      .from("appointments")
      .update({ metadata: updatedMetadata })
      .eq("id", body.appointment_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: appointment })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
