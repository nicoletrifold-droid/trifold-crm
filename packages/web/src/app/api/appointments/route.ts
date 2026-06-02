import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createCalendarEvent } from "@web/lib/google-calendar"
import { normalizePhoneBR } from "@trifold/shared"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const url = new URL(request.url)
  const brokerId = url.searchParams.get("broker_id")
  const dateFrom = url.searchParams.get("date_from")
  const dateTo = url.searchParams.get("date_to")
  const status = url.searchParams.get("status")
  const propertyId = url.searchParams.get("property_id")
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "50")), 100)
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("appointments")
    .select(
      `
      id, scheduled_at, duration_minutes, location, status, notes, created_by, created_at, updated_at,
      lead:leads!lead_id(id, name, phone),
      broker:users!broker_id(id, name, email),
      property:properties!property_id(id, name)
    `,
      { count: "exact" }
    )
    .eq("org_id", appUser.org_id)
    .order("scheduled_at", { ascending: true })
    .range(from, to)

  if (brokerId) {
    query = query.eq("broker_id", brokerId)
  }

  if (dateFrom) {
    query = query.gte("scheduled_at", dateFrom)
  }

  if (dateTo) {
    query = query.lte("scheduled_at", dateTo)
  }

  if (status) {
    query = query.eq("status", status)
  }

  if (propertyId) {
    query = query.eq("property_id", propertyId)
  }

  const { data: appointments, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: appointments, count, page, limit })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const body = await request.json()

  // Validate: either lead_id or client_phone must be provided
  if (!body.lead_id && !body.client_phone) {
    return NextResponse.json(
      { error: "lead_id or client_phone is required" },
      { status: 400 }
    )
  }

  if (!body.scheduled_at) {
    return NextResponse.json(
      { error: "scheduled_at is required" },
      { status: 400 }
    )
  }

  const scheduledAt = new Date(body.scheduled_at)
  if (scheduledAt <= new Date()) {
    return NextResponse.json(
      { error: "scheduled_at must be in the future" },
      { status: 400 }
    )
  }

  // Resolve lead_id: auto-create lead if only client_phone was provided
  let leadId: string | null = body.lead_id ?? null

  if (!leadId && body.client_phone) {
    const assignedBrokerId =
      body.broker_id ||
      (appUser.role === "broker" ? appUser.id : null) ||
      null

    // Find-or-create: check if lead with this phone already exists (match on normalized phone)
    const normalizedPhone = normalizePhoneBR(body.client_phone.trim())
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", appUser.org_id)
      .eq("phone_normalized", normalizedPhone)
      .eq("is_active", true)
      .maybeSingle()

    if (existingLead) {
      leadId = existingLead.id
    } else {
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          org_id: appUser.org_id,
          name: body.client_name?.trim() || body.client_phone,
          phone: body.client_phone.trim(),
          email: body.client_email?.trim() || null,
          assigned_broker_id: assignedBrokerId,
        })
        .select("id")
        .single()

      if (leadError || !newLead) {
        return NextResponse.json(
          { error: leadError?.message ?? "Failed to create lead" },
          { status: 500 }
        )
      }

      leadId = newLead.id
    }
  }

  // Double-booking check: same location and overlapping time window
  const location = body.location?.trim() || "Stand Trifold"
  const duration = body.duration_minutes || 30
  const newStart = new Date(body.scheduled_at)
  const newEnd = new Date(newStart.getTime() + duration * 60000)

  if (location) {
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id, scheduled_at, duration_minutes")
      .eq("org_id", appUser.org_id)
      .eq("location", location)
      .in("status", ["scheduled", "confirmed"])
      .gte(
        "scheduled_at",
        new Date(newStart.getTime() - 120 * 60000).toISOString()
      )
      .lte("scheduled_at", newEnd.toISOString())

    const trueConflict = (conflicts ?? []).some((existing) => {
      const existStart = new Date(existing.scheduled_at)
      const existEnd = new Date(
        existStart.getTime() + (existing.duration_minutes ?? 30) * 60000
      )
      // Overlap: newStart < existEnd && existStart < newEnd
      return newStart < existEnd && existStart < newEnd
    })

    if (trueConflict) {
      return NextResponse.json(
        { error: "Conflito de horário: já existe um agendamento nesse local e horário." },
        { status: 409 }
      )
    }
  }

  // Determine created_by
  let createdBy: "admin" | "broker" | "nicole" = "admin"
  if (appUser.role === "broker") {
    createdBy = "broker"
  } else if (body.created_by) {
    createdBy = body.created_by
  }

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      org_id: appUser.org_id,
      lead_id: leadId,
      broker_id: body.broker_id || (appUser.role === "broker" ? appUser.id : null) || null,
      property_id: body.property_id || null,
      scheduled_at: body.scheduled_at,
      duration_minutes: duration,
      location,
      status: body.status || "scheduled",
      notes: body.notes?.trim() || null,
      created_by: createdBy,
      client_name: body.client_name?.trim() || null,
      client_email: body.client_email?.trim() || null,
      client_phone: body.client_phone?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Create Google Calendar event (fire-and-forget)
  const googleEventId = await createCalendarEvent({
    title: `Visita ao decorado${body.client_name ? ` — ${body.client_name}` : ""}`,
    description: [
      body.notes ?? "",
      location ? `Local: ${location}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    startAt: newStart,
    endAt: newEnd,
    attendeeEmail: body.client_email?.trim() || undefined,
  })

  if (googleEventId) {
    await supabase
      .from("appointments")
      .update({ google_event_id: googleEventId })
      .eq("id", appointment.id)
  }

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: leadId,
    user_id: appUser.id,
    type: "appointment_created",
    description: `Agendamento criado para ${scheduledAt.toLocaleString("pt-BR")}`,
    metadata: { appointment_id: appointment.id },
  })

  return NextResponse.json({ data: { ...appointment, google_event_id: googleEventId } }, { status: 201 })
}
