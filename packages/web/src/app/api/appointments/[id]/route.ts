import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"
import { deleteCalendarEvent } from "@web/lib/google-calendar"
import { canMutateAppointment, isConflict } from "@web/lib/appointments/governance"

// Campos cuja alteração exige justificativa (edição de dados do compromisso).
// Mudança só de status (completed/confirmed/no_show) não é "edição de dados".
const DETAIL_FIELDS = ["scheduled_at", "duration_minutes", "location", "broker_id", "property_id", "notes"] as const

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
    .select("id, google_event_id, lead_id, broker_id, calendly_event_uri, scheduled_at, duration_minutes, location")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  // Story 75-103: só o dono (corretor) ou admin/supervisor/gerente-comercial editam.
  // Compromisso do Calendly (cliente marcou sozinho) é livre.
  if (!canMutateAppointment(appUser.role, appUser.id, existing)) {
    return NextResponse.json(
      { error: "Sem permissão para editar este agendamento" },
      { status: 403 }
    )
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

  // Story 75-103: editar dados do compromisso exige justificativa (rastreável).
  const changesDetails = DETAIL_FIELDS.some((f) => f in updateFields)
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  if (changesDetails && !reason) {
    return NextResponse.json(
      { error: "Justificativa obrigatória para editar o agendamento" },
      { status: 400 }
    )
  }

  // Story 75-103: ao remarcar (muda horário/duração/local), revalida conflito.
  const reschedules = "scheduled_at" in updateFields || "duration_minutes" in updateFields || "location" in updateFields
  if (reschedules) {
    // Compromissos de 1 em 1 hora: ao MUDAR o horário, normaliza p/ hora cheia + 1h
    // (edições só de local/nota mantêm a duração existente).
    const changingTime = "scheduled_at" in updateFields
    const newStart = new Date((updateFields.scheduled_at as string) ?? existing.scheduled_at)
    if (changingTime) newStart.setMinutes(0, 0, 0)
    const newDuration = changingTime
      ? 60
      : ((updateFields.duration_minutes as number) ?? existing.duration_minutes ?? 30)
    const newLocation = ((updateFields.location as string) ?? existing.location ?? "Stand Trifold")
    const newEnd = new Date(newStart.getTime() + newDuration * 60000)
    if (changingTime) {
      updateFields.scheduled_at = newStart.toISOString()
      updateFields.duration_minutes = 60
    }

    const { data: others } = await supabase
      .from("appointments")
      .select("id, scheduled_at, duration_minutes, location, calendly_event_uri")
      .eq("org_id", appUser.org_id)
      .in("status", ["scheduled", "confirmed"])
      .neq("id", id)
      .gte("scheduled_at", new Date(newStart.getTime() - 120 * 60000).toISOString())
      .lte("scheduled_at", newEnd.toISOString())

    const conflict = (others ?? []).some((o) =>
      isConflict(
        { start: newStart.getTime(), end: newEnd.getTime(), location: newLocation },
        {
          start: new Date(o.scheduled_at).getTime(),
          end: new Date(o.scheduled_at).getTime() + (o.duration_minutes ?? 30) * 60000,
          location: o.location ?? "",
          calendly_event_uri: o.calendly_event_uri,
        }
      )
    )
    if (conflict) {
      return NextResponse.json(
        { error: "Conflito de horário: já existe um agendamento nesse local e horário." },
        { status: 409 }
      )
    }
  }

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
      reason: reason || null,
    },
  })

  return NextResponse.json({ data: appointment })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Fetch current appointment to get google_event_id before soft-deleting
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, google_event_id, lead_id, broker_id, calendly_event_uri")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  // Story 75-103: só o dono (corretor) ou admin/supervisor/gerente-comercial cancelam.
  // Compromisso do Calendly (cliente marcou sozinho) é livre.
  if (!canMutateAppointment(appUser.role, appUser.id, existing)) {
    return NextResponse.json(
      { error: "Sem permissão para excluir este agendamento" },
      { status: 403 }
    )
  }

  // Story 75-103: cancelamento exige justificativa (rastreável).
  const body = await req.json().catch(() => ({}))
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!reason) {
    return NextResponse.json(
      { error: "Justificativa obrigatória para cancelar o agendamento" },
      { status: 400 }
    )
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
    metadata: { appointment_id: appointment.id, reason },
  })

  return NextResponse.json({ data: { message: "Appointment cancelled" } })
}
