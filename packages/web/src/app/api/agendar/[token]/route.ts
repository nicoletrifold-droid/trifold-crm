import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getOrgSchedule } from "@web/lib/roleta/business-time"
import { imobSlotsForDay, isValidImobSlot, type ImobBusySlot } from "@web/lib/appointments/imob-slots"
import { PROPERTY_MAP, LOCATIONS, isBookableLocation } from "@web/lib/appointments/locations"
import { sendPushToUser } from "@web/lib/server/push-service"
import { overlaps } from "@web/lib/appointments/governance"
import { normalizePhoneBR } from "@trifold/shared"

// Deep-link do push — SEMPRE o domínio custom (cookie de sessão; ver memória 75-152).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

// Story 81-4 (Epic 81) — endpoint PÚBLICO do link de agendamento por imobiliária.
// Token = imobiliarias.booking_token (uuid não-enumerável; NULL = revogado).
// Tudo que a imobiliária vê/faz é da equipe IMOB: disponibilidade só considera
// compromissos team='imob' (house é invisível e não bloqueia — Story 81-1) e a
// marcação nasce team='imob' com a imobiliária carimbada (imobiliaria_id).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Imobiliaria {
  id: string
  org_id: string
  nome: string
  status: string | null
}

async function findImobiliariaByToken(token: string): Promise<Imobiliaria | null> {
  if (!UUID_RE.test(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("imobiliarias")
    .select("id, org_id, nome, status")
    .eq("booking_token", token)
    .maybeSingle()
  return (data as Imobiliaria | null) ?? null
}

/** Compromissos IMOB ativos num intervalo (para grade/checagem de conflito). */
async function imobBusyBetween(orgId: string, fromIso: string, toIso: string): Promise<ImobBusySlot[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("appointments")
    .select("scheduled_at, duration_minutes, location")
    .eq("org_id", orgId)
    .eq("team", "imob")
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso)
  return (data ?? []) as ImobBusySlot[]
}

// GET /api/agendar/[token]?date=YYYY-MM-DD&location=Decorado%20Vind
// → { imobiliaria, locations, slots } (slots livres/ocupados do dia p/ o local)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const imob = await findImobiliariaByToken(token)
  if (!imob) return NextResponse.json({ error: "Link inválido ou revogado." }, { status: 404 })

  const url = new URL(request.url)
  const date = url.searchParams.get("date") // YYYY-MM-DD (dia no fuso da org)
  const location = url.searchParams.get("location") ?? LOCATIONS[0]!

  const payload: Record<string, unknown> = {
    imobiliaria: { nome: imob.nome },
    locations: LOCATIONS,
  }

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && isBookableLocation(location)) {
    const [y, mo, d] = date.split("-").map(Number) as [number, number, number]
    const admin = createAdminClient()
    const { week, timezone } = await getOrgSchedule(imob.org_id, admin)
    // Janela do dia com folga de fuso (busy é filtrado pela grade por sobreposição).
    const dayStart = new Date(Date.UTC(y, mo - 1, d - 1, 0, 0)).toISOString()
    const dayEnd = new Date(Date.UTC(y, mo - 1, d + 2, 0, 0)).toISOString()
    const busy = await imobBusyBetween(imob.org_id, dayStart, dayEnd)
    payload.slots = imobSlotsForDay({ y, mo, d, location, week, timezone, busy, now: new Date() })
  }

  return NextResponse.json(payload)
}

// POST /api/agendar/[token]
// body: { scheduled_at, location, client_name, client_phone, client_email?, notes? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const imob = await findImobiliariaByToken(token)
  if (!imob) return NextResponse.json({ error: "Link inválido ou revogado." }, { status: 404 })

  const body = (await request.json().catch(() => null)) as {
    scheduled_at?: string
    location?: string
    client_name?: string
    client_phone?: string
    client_email?: string
    broker_name?: string // Story 81-5: corretor DA PARCEIRA que acompanha (opcional)
    broker_phone?: string
    notes?: string
  } | null
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 })

  const clientName = body.client_name?.trim()
  const clientPhone = body.client_phone?.trim()
  // Story 81-5 — corretor da imobiliária (opcional): vai estruturado no metadata
  // (p/ futura notificação a ele) E numa linha humana nas notes (visível em toda tela).
  const brokerName = body.broker_name?.trim() || null
  const brokerPhone = body.broker_phone?.trim() || null
  const location = body.location?.trim() ?? ""
  if (!clientName) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 })
  if (!clientPhone) return NextResponse.json({ error: "Informe o telefone do cliente." }, { status: 400 })
  if (!isBookableLocation(location)) {
    return NextResponse.json({ error: "Selecione um decorado válido." }, { status: 400 })
  }

  const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null
  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Data/hora inválida." }, { status: 400 })
  }
  scheduledAt.setMinutes(0, 0, 0) // hora cheia (guard de servidor, como no fluxo interno)
  if (scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Escolha um horário no futuro." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { week, timezone } = await getOrgSchedule(imob.org_id, admin)
  if (!isValidImobSlot(scheduledAt, week, timezone)) {
    return NextResponse.json({ error: "Horário fora do expediente. Escolha um horário disponível." }, { status: 400 })
  }

  // Conflito SÓ contra a equipe IMOB, mesmo local (Story 81-1). Recheca na hora
  // do POST (corrida entre imobiliárias → 409 amigável, a página pede outro slot).
  const endAt = new Date(scheduledAt.getTime() + 60 * 60_000)
  const busy = await imobBusyBetween(
    imob.org_id,
    new Date(scheduledAt.getTime() - 2 * 60 * 60_000).toISOString(),
    endAt.toISOString()
  )
  const taken = busy.some((b) => {
    if ((b.location ?? "") !== location) return false
    const bStart = new Date(b.scheduled_at).getTime()
    const bEnd = bStart + (b.duration_minutes ?? 60) * 60_000
    return overlaps(scheduledAt.getTime(), endAt.getTime(), bStart, bEnd)
  })
  if (taken) {
    return NextResponse.json(
      { error: "Esse horário acabou de ser ocupado. Escolha outro horário." },
      { status: 409 }
    )
  }

  // Lead: find-or-create por telefone normalizado (padrão do POST interno).
  // Novo lead nasce no MUNDO IMOB (segmento='imob' — não polui funil/métricas do
  // principal) com responsável = primeiro usuário ativo do perfil imob (Daiana).
  let leadId: string | null = null
  const normalizedPhone = normalizePhoneBR(clientPhone)
  const phoneQuery = normalizedPhone
    ? admin.from("leads").select("id").eq("org_id", imob.org_id).eq("phone_normalized", normalizedPhone)
    : admin.from("leads").select("id").eq("org_id", imob.org_id).eq("phone", clientPhone)
  const { data: existingLead } = await phoneQuery.limit(1).maybeSingle()

  if (existingLead) {
    leadId = existingLead.id as string
  } else {
    const { data: daiana } = await admin
      .from("users")
      .select("id")
      .eq("org_id", imob.org_id)
      .eq("role", "imob")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const { data: newLead, error: leadError } = await admin
      .from("leads")
      .insert({
        org_id: imob.org_id,
        name: clientName,
        phone: clientPhone,
        email: body.client_email?.trim() || null,
        segmento: "imob",
        assigned_broker_id: (daiana?.id as string | undefined) ?? null,
        source: "imob_link",
      })
      .select("id")
      .single()
    if (leadError || !newLead) {
      return NextResponse.json({ error: "Não foi possível registrar o cliente. Tente novamente." }, { status: 500 })
    }
    leadId = newLead.id as string
  }

  const { data: appointment, error: apptError } = await admin
    .from("appointments")
    .insert({
      org_id: imob.org_id,
      lead_id: leadId,
      broker_id: null,
      property_id: PROPERTY_MAP[location]?.id ?? null,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 60,
      location,
      team: "imob",
      imobiliaria_id: imob.id,
      status: "scheduled",
      created_by: "admin", // decisão da story: enum intacto; origem real = imobiliaria_id + metadata
      notes: [
        body.notes?.trim() || null,
        brokerName ? `Corretor parceiro: ${brokerName}${brokerPhone ? ` · ${brokerPhone}` : ""}` : null,
      ]
        .filter(Boolean)
        .join("\n") || null,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: body.client_email?.trim() || null,
      metadata: {
        origem: "link_imob",
        imobiliaria_nome: imob.nome,
        ...(brokerName || brokerPhone
          ? { corretor_parceiro: { nome: brokerName, telefone: brokerPhone } }
          : {}),
      },
    })
    .select("id, scheduled_at, location, cancel_token")
    .single()
  if (apptError || !appointment) {
    return NextResponse.json({ error: "Não foi possível agendar. Tente novamente." }, { status: 500 })
  }

  await admin.from("activities").insert({
    org_id: imob.org_id,
    lead_id: leadId,
    type: "appointment_created",
    description: `Visita marcada pela imobiliária ${imob.nome} via link público (${location})`,
    metadata: { appointment_id: appointment.id, imobiliaria_id: imob.id, origem: "link_imob" },
  })

  // Push para a equipe IMOB interna (Daiana) — fire-and-forget.
  void (async () => {
    const { data: imobUsers } = await admin
      .from("users")
      .select("id")
      .eq("org_id", imob.org_id)
      .eq("role", "imob")
      .eq("is_active", true)
    const when = new Date(appointment.scheduled_at).toLocaleString("pt-BR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    await Promise.all(
      (imobUsers ?? []).map((u) =>
        sendPushToUser(admin, u.id as string, {
          title: `Nova visita — ${imob.nome}`,
          body: `${clientName} · ${when} · ${location}${brokerName ? ` · corr. ${brokerName}` : ""}`,
          url: `${APP_URL}/dashboard/agenda`,
        }).catch((e: unknown) => console.error("[agendar-imob] push:", e))
      )
    )
  })()

  return NextResponse.json(
    {
      data: {
        scheduled_at: appointment.scheduled_at,
        location: appointment.location,
        cancel_token: appointment.cancel_token,
      },
    },
    { status: 201 }
  )
}
