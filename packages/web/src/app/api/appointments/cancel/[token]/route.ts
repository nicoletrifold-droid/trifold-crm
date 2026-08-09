import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { mirrorDelete } from "@web/lib/appointments/google-mirror"
import { notifyVisitCancelledWhatsApp } from "@web/lib/appointments/visit-whatsapp"

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
    .select(
      "id, status, google_event_id, org_id, team, broker_id, lead_id, metadata, client_name, location, scheduled_at, property:properties!property_id(name)"
    )
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
  {
    // Story 75-275 — via helper: apaga no Google E limpa `google_event_id`. Antes só
    // apagava, deixando id morto na coluna — que uma remarcação futura tentaria mover.
    await mirrorDelete(supabase, appointment.id, appointment.google_event_id)
  }

  // Story 75-192 — cliente cancelou pelo link: avisa quem ia atender por
  // WhatsApp (house → corretor; imob → corretor parceiro + equipe IMOB) e
  // registra na timeline do lead. Fire-and-forget: nunca bloqueia o cancelamento.
  const property = Array.isArray(appointment.property)
    ? appointment.property[0]
    : appointment.property
  void notifyVisitCancelledWhatsApp(supabase, {
    org_id: appointment.org_id as string,
    team: (appointment.team as string | null) ?? null,
    broker_id: (appointment.broker_id as string | null) ?? null,
    lead_id: (appointment.lead_id as string | null) ?? null,
    metadata: (appointment.metadata as Record<string, unknown> | null) ?? null,
    client_name: (appointment.client_name as string | null) ?? null,
    location: (appointment.location as string | null) ?? null,
    scheduled_at: appointment.scheduled_at as string,
    propertyName: (property?.name as string | undefined) ?? null,
  })
    .then((r) => {
      if (r.errors.length) console.error("[cancel-visita] whatsapp:", r.errors.join(" | "))
    })
    .catch((e: unknown) => console.error("[cancel-visita] whatsapp:", e))

  if (appointment.lead_id) {
    await supabase.from("activities").insert({
      org_id: appointment.org_id,
      lead_id: appointment.lead_id,
      type: "appointment_cancelled",
      description: "Cliente cancelou a visita pelo link de cancelamento.",
      metadata: { appointment_id: appointment.id, origem: "cancel_link" },
    })
  }

  return NextResponse.json({ ok: true })
}
