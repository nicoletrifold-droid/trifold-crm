import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getOrgSchedule } from "@web/lib/roleta/business-time"
import { imobSlotsForDay, isValidImobSlot, type ImobBusySlot } from "@web/lib/appointments/imob-slots"
import { PROPERTY_MAP, LOCATIONS, isBookableLocation } from "@web/lib/appointments/locations"
import { sendPushToUser } from "@web/lib/server/push-service"
import { notifyImobVisitWhatsApp } from "@web/lib/appointments/notify-imob-visit"
import { notifyVisitBookedWhatsApp } from "@web/lib/appointments/visit-whatsapp"
import { overlaps } from "@web/lib/appointments/governance"
import { mirrorCreate } from "@web/lib/appointments/google-mirror"
import { normalizePhoneBR, STAGE_IDS, advanceToVisitaAgendada } from "@trifold/shared"

// Deep-link do push — SEMPRE o domínio custom (cookie de sessão; ver memória 75-152).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

// Story 81-4 (Epic 81) — endpoint PÚBLICO do link de agendamento por imobiliária.
// Token = imobiliarias.booking_token (uuid não-enumerável; NULL = revogado).
// Tudo que a imobiliária vê/faz é da equipe IMOB: disponibilidade só considera
// compromissos team='imob' (house é invisível e não bloqueia — Story 81-1) e a
// marcação nasce team='imob' com a imobiliária carimbada (imobiliaria_id).
// Story 81-9: dentro da equipe IMOB o conflito é por HORÁRIO, independente do
// local — a grade e o recheck do POST não filtram por local.

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
    .select("scheduled_at, duration_minutes")
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

  const payload: Record<string, unknown> = {
    imobiliaria: { nome: imob.nome },
    locations: LOCATIONS,
  }

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, mo, d] = date.split("-").map(Number) as [number, number, number]
    const admin = createAdminClient()
    const { week, timezone } = await getOrgSchedule(imob.org_id, admin)
    // Janela do dia com folga de fuso (busy é filtrado pela grade por sobreposição).
    const dayStart = new Date(Date.UTC(y, mo - 1, d - 1, 0, 0)).toISOString()
    const dayEnd = new Date(Date.UTC(y, mo - 1, d + 2, 0, 0)).toISOString()
    const busy = await imobBusyBetween(imob.org_id, dayStart, dayEnd)
    payload.slots = imobSlotsForDay({ y, mo, d, week, timezone, busy, now: new Date() })
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
  scheduledAt.setMinutes(scheduledAt.getMinutes() < 30 ? 0 : 30, 0, 0) // alinha a :00/:30 (guard de servidor, como no fluxo interno)
  if (scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Escolha um horário no futuro." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { week, timezone } = await getOrgSchedule(imob.org_id, admin)
  if (!isValidImobSlot(scheduledAt, week, timezone)) {
    return NextResponse.json({ error: "Horário fora do expediente. Escolha um horário disponível." }, { status: 400 })
  }

  // Conflito SÓ contra a equipe IMOB, por HORÁRIO — local não importa (Story 81-9).
  // Recheca na hora do POST (corrida entre imobiliárias → 409 amigável, a página
  // pede outro slot).
  const endAt = new Date(scheduledAt.getTime() + 60 * 60_000)
  const busy = await imobBusyBetween(
    imob.org_id,
    new Date(scheduledAt.getTime() - 2 * 60 * 60_000).toISOString(),
    endAt.toISOString()
  )
  const taken = busy.some((b) => {
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
        // Story 75-196: nasce em "Novo" (stage NULL era invisível no pipeline
        // IMOB); avança para "Visita Agendada" só DEPOIS do appointment gravar —
        // se o agendamento falhar, o lead não fica carimbado com visita fantasma.
        stage_id: STAGE_IDS.novo,
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

  // Story 75-196: com a visita GRAVADA, o lead avança para "Visita Agendada"
  // (guard só-avança; não regride nem ressuscita perdido). Segmento fica
  // intacto — lead imob segue aparecendo só no pipeline IMOB. Best-effort:
  // falha de etapa não derruba o agendamento já criado.
  if (leadId) {
    await advanceToVisitaAgendada(admin, leadId)
  }

  // Story 75-275 — o link da imobiliária passa a espelhar no Google Calendar. Era o
  // furo mais silencioso do espelho: justamente as visitas que NINGUÉM do escritório
  // digita (a imobiliária marca sozinha) eram as que a copa não veria. Título ganha
  // prefixo [IMOB] no helper, porque team='imob'.
  await mirrorCreate(
    admin,
    {
      id: appointment.id,
      scheduled_at: appointment.scheduled_at,
      duration_minutes: 60,
      location: appointment.location,
      notes: null,
      client_name: clientName,
      team: "imob",
    },
    { origin: `Marcada pela imobiliária ${imob.nome} via link público.` }
  )

  await admin.from("activities").insert({
    org_id: imob.org_id,
    lead_id: leadId,
    type: "appointment_created",
    description: `Visita marcada pela imobiliária ${imob.nome} via link público (${location})`,
    metadata: { appointment_id: appointment.id, imobiliaria_id: imob.id, origem: "link_imob" },
  })

  // Notifica a equipe IMOB (Daiana) — fire-and-forget. Push (in-app) + WhatsApp
  // (Story 75-174, template nova_visita_imob) para os usuários IMOB ativos.
  const when = new Date(appointment.scheduled_at).toLocaleString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  void (async () => {
    const { data: imobUsers } = await admin
      .from("users")
      .select("id")
      .eq("org_id", imob.org_id)
      .eq("role", "imob")
      .eq("is_active", true)
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
  void notifyImobVisitWhatsApp(admin, imob.org_id, {
    leadName: clientName,
    whenLabel: when,
    imobiliariaNome: imob.nome,
  })
    .then((r) => {
      if (r.errors.length) console.error("[agendar-imob] whatsapp:", r.errors.join(" | "))
    })
    .catch((e: unknown) => console.error("[agendar-imob] whatsapp:", e))

  // Story 75-191 — confirmação por WhatsApp (template) ao CLIENTE (com botão de
  // cancelar) e ao CORRETOR PARCEIRO, no ato do agendamento. Fire-and-forget.
  void notifyVisitBookedWhatsApp(admin, imob.org_id, {
    clientName,
    clientPhone,
    propertyName: PROPERTY_MAP[location]?.name ?? location,
    whenLabel: when,
    cancelToken: (appointment.cancel_token as string | null) ?? null,
    partnerBrokerName: brokerName,
    partnerBrokerPhone: brokerPhone,
  })
    .then((r) => {
      if (r.errors.length) console.error("[agendar-imob] whatsapp cliente/corretor:", r.errors.join(" | "))
    })
    .catch((e: unknown) => console.error("[agendar-imob] whatsapp cliente/corretor:", e))

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
