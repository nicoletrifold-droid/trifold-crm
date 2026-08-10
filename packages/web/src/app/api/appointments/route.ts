import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { mirrorCreate } from "@web/lib/appointments/google-mirror"
import { resolveVisitBrokerOnCreate, formatVisitWhen } from "@web/lib/appointments/sync-visit-owner"
import { notifyBrokerOfAppointment } from "@web/lib/broker/notify-appointment"
import { normalizePhoneBR, STAGE_IDS, advanceToVisitaAgendada } from "@trifold/shared"
import { isConflict, type AppointmentTeam } from "@web/lib/appointments/governance"

// Story 81-1 — stamping da EQUIPE do compromisso, decidido no servidor:
//  - perfil `imob` (Daiana) → sempre 'imob';
//  - admin/supervisor → podem escolher via body.team (validado; default 'house');
//  - demais perfis (corretor, gerente-comercial, etc.) → sempre 'house'.
function resolveTeam(role: string, bodyTeam: unknown): AppointmentTeam {
  if (role === "imob") return "imob"
  if (["admin", "supervisor"].includes(role) && (bodyTeam === "house" || bodyTeam === "imob")) {
    return bodyTeam
  }
  return "house"
}

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
      id, scheduled_at, duration_minutes, location, status, notes, team, created_by, created_at, updated_at,
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
    const assignedBrokerId = body.broker_id || appUser.id

    // Find-or-create: check if any lead with this phone exists for this org (active or not)
    const normalizedPhone = normalizePhoneBR(body.client_phone.trim())
    const phoneQuery = normalizedPhone
      ? supabase.from("leads").select("id").eq("org_id", appUser.org_id).eq("phone_normalized", normalizedPhone)
      : supabase.from("leads").select("id").eq("org_id", appUser.org_id).eq("phone", body.client_phone.trim())
    const { data: existingLead } = await phoneQuery.limit(1).maybeSingle()

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
          // Story 75-196: nasce em "Novo" (antes ficava stage NULL, invisível no
          // pipeline); avança p/ "Visita Agendada" após o INSERT do appointment.
          stage_id: STAGE_IDS.novo,
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

  // Double-booking check (Story 81-9): sobrepor no horário dentro da MESMA equipe
  // já é conflito — o local não importa (1 compromisso por horário por equipe).
  // Story 81-1: HOUSE × IMOB não se bloqueiam.
  const team = resolveTeam(appUser.role, body.team)
  const location = body.location?.trim() || "Stand Trifold"
  // Compromissos de 1h com início alinhado a :00/:30 (guard de servidor,
  // independente do que o cliente enviar — passo de 30min desde 2026-07-23).
  const duration = 60
  const newStart = new Date(body.scheduled_at)
  newStart.setMinutes(newStart.getMinutes() < 30 ? 0 : 30, 0, 0)
  const newEnd = new Date(newStart.getTime() + duration * 60000)

  {
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id, scheduled_at, duration_minutes, team")
      .eq("org_id", appUser.org_id)
      .in("status", ["scheduled", "confirmed"])
      .gte(
        "scheduled_at",
        new Date(newStart.getTime() - 120 * 60000).toISOString()
      )
      .lte("scheduled_at", newEnd.toISOString())

    const trueConflict = (conflicts ?? []).some((existing) =>
      isConflict(
        { start: newStart.getTime(), end: newEnd.getTime(), team },
        {
          start: new Date(existing.scheduled_at).getTime(),
          end: new Date(existing.scheduled_at).getTime() + (existing.duration_minutes ?? 30) * 60000,
          team: (existing.team as AppointmentTeam) ?? "house",
        }
      )
    )

    if (trueConflict) {
      return NextResponse.json(
        { error: "Conflito de horário: a equipe já tem um agendamento nesse horário." },
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

  // Story 81-7 — extras da equipe IMOB (opcionais): imobiliária vinculada (validada
  // na org) + corretor parceiro. Mesma gravação do link público (81-4/81-5):
  // imobiliaria_id na coluna, nomes em metadata, linha humana nas notes.
  let imobiliariaId: string | null = null
  let imobiliariaNome: string | null = null
  const partnerName = typeof body.partner_broker_name === "string" ? body.partner_broker_name.trim() : ""
  const partnerPhone = typeof body.partner_broker_phone === "string" ? body.partner_broker_phone.trim() : ""
  if (team === "imob") {
    if (typeof body.imobiliaria_id === "string" && body.imobiliaria_id) {
      // Tabela imobiliarias tem RLS sem policy — leitura só via admin client
      // (mesma razão do imobiliariasGuard). Filtro de org aplicado manualmente.
      const { data: imob } = await createAdminClient()
        .from("imobiliarias")
        .select("id, nome")
        .eq("id", body.imobiliaria_id)
        .eq("org_id", appUser.org_id)
        .maybeSingle()
      if (!imob) {
        return NextResponse.json({ error: "Imobiliária inválida." }, { status: 422 })
      }
      imobiliariaId = imob.id as string
      imobiliariaNome = (imob.nome as string) ?? null
    }
  }
  const imobMetadata =
    team === "imob" && (imobiliariaNome || partnerName || partnerPhone)
      ? {
          ...(imobiliariaNome ? { imobiliaria_nome: imobiliariaNome } : {}),
          ...(partnerName || partnerPhone
            ? { corretor_parceiro: { nome: partnerName || null, telefone: partnerPhone || null } }
            : {}),
        }
      : null
  const notesBase = body.notes?.trim() || null
  const notesFinal =
    team === "imob" && partnerName
      ? [notesBase, `Corretor parceiro: ${partnerName}${partnerPhone ? ` · ${partnerPhone}` : ""}`]
          .filter(Boolean)
          .join("\n")
      : notesBase

  // Story 75-288 — a visita nasce de quem ATENDE o lead (mesmo princípio da
  // 75-249, aplicado na criação): sem corretor explícito no payload, um lead
  // COM dono carimba o dono — não quem clicou em salvar. Caso Matheus (10/08):
  // a SDR transferiu o lead e agendou em seguida; a visita nascia dela e o
  // lembrete de WhatsApp iria pra ela. Só team house — visita IMOB tem dono
  // próprio (imobiliária/corretor parceiro, Epic 81).
  let leadOwnerId: string | null = null
  let leadNameForNotify: string | null = body.client_name?.trim() || null
  let leadPhoneForNotify: string | null = body.client_phone?.trim() || null
  if (team === "house" && leadId && !body.broker_id) {
    const { data: leadRow } = await supabase
      .from("leads")
      .select("assigned_broker_id, name, phone")
      .eq("id", leadId)
      .maybeSingle()
    leadOwnerId = (leadRow?.assigned_broker_id as string | null) ?? null
    leadNameForNotify = (leadRow?.name as string | null) ?? leadNameForNotify
    leadPhoneForNotify = (leadRow?.phone as string | null) ?? leadPhoneForNotify
  }
  const { brokerId: visitBrokerId, notifyOwner } = resolveVisitBrokerOnCreate({
    explicitBrokerId: body.broker_id ?? null,
    leadOwnerId,
    creatorId: appUser.id,
  })

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      org_id: appUser.org_id,
      lead_id: leadId,
      broker_id: visitBrokerId,
      property_id: body.property_id || null,
      scheduled_at: newStart.toISOString(),
      duration_minutes: duration,
      location,
      team,
      imobiliaria_id: imobiliariaId,
      status: body.status || "scheduled",
      notes: notesFinal,
      created_by: createdBy,
      ...(imobMetadata ? { metadata: imobMetadata } : {}),
      client_name: body.client_name?.trim() || null,
      client_email: body.client_email?.trim() || null,
      client_phone: body.client_phone?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Story 75-196: visita gravada → lead avança para "Visita Agendada" (guard
  // só-avança no WHERE: não regride visitou/proposta/…, não ressuscita perdido,
  // no_show remarcado volta). Best-effort — não derruba o agendamento criado.
  if (leadId) {
    await advanceToVisitaAgendada(supabase, leadId)
  }

  // Story 75-275 — espelho no Google Calendar (a copa lê para preparar café).
  // Best-effort: o helper nunca lança e registra a falha em metadata.google_sync.
  const googleEventId = await mirrorCreate(supabase, {
    id: appointment.id,
    scheduled_at: appointment.scheduled_at,
    duration_minutes: appointment.duration_minutes,
    location,
    notes: body.notes ?? null,
    client_name: body.client_name?.trim() || null,
    team: appointment.team,
  })

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: leadId,
    user_id: appUser.id,
    type: "appointment_created",
    description: `Agendamento criado para ${scheduledAt.toLocaleString("pt-BR")}`,
    metadata: { appointment_id: appointment.id },
  })

  // Story 75-288 — a visita nasceu do dono do lead, que NÃO é quem criou:
  // avisa o dono (senão ele só descobre no lembrete de véspera). Best-effort —
  // notifyBrokerOfAppointment nunca lança.
  if (notifyOwner && leadId) {
    await notifyBrokerOfAppointment({
      orgId: appUser.org_id,
      brokerUserId: visitBrokerId,
      leadId,
      leadName: leadNameForNotify,
      leadPhone: leadPhoneForNotify,
      variant: "scheduled_by_other",
      whenStr: formatVisitWhen(appointment.scheduled_at as string),
      actorName: appUser.name ?? null,
    })
  }

  return NextResponse.json({ data: { ...appointment, google_event_id: googleEventId } }, { status: 201 })
}
