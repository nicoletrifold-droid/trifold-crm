import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { parseFormSchema, type FormSchema } from "@web/lib/forms/schema"
import { gradeDaEquipe, ocupadosDaEquipe } from "@web/lib/appointments/team-slots"
import { isValidImobSlot } from "@web/lib/appointments/imob-slots"
import { getOrgSchedule } from "@web/lib/roleta/business-time"
import { PROPERTY_MAP, LOCATIONS, isBookableLocation } from "@web/lib/appointments/locations"
import { overlaps } from "@web/lib/appointments/governance"
import { mirrorCreate } from "@web/lib/appointments/google-mirror"
import { advanceToVisitaAgendada } from "@trifold/shared"

// Story 75-331 (Epic 89) — a AGENDA no fim do formulário público.
//
// Equipe HOUSE (o link da imobiliária é o `/api/agendar/[token]`, que é `imob`).
// Decisões do diretor que este arquivo materializa:
//   D1 — o horário BLOQUEIA na hora: a visita nasce `scheduled` e some da grade.
//   D2 — a agenda aparece para TODOS; o score não decide nada aqui.
//   D3 (revisada 17/08) — o lead fica com o SDR e NÃO há entrega automática à
//        roleta. O SDR transfere manualmente depois. Por isso NÃO existe chamada
//        a `distributeLeadToNextBroker` neste arquivo, e isso é intencional:
//        o distribuidor desiste quando o lead já tem dono (distributor.ts:86-88).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_INVALIDO = { error: "Link inválido ou desativado." }
const DURACAO_MIN = 60

interface FormComAgenda {
  id: string
  org_id: string
  nome: string
  schema: FormSchema
}

async function acharFormulario(token: string): Promise<FormComAgenda | null> {
  if (!UUID_RE.test(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_forms")
    .select("id, org_id, nome, schema")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle()
  if (!data) return null
  try {
    const schema = parseFormSchema((data as { schema: unknown }).schema)
    if (!schema.agenda?.ativa) return null // AC1/AC7: agenda desligada
    return { ...(data as unknown as FormComAgenda), schema }
  } catch {
    return null
  }
}

/** Decorados oferecidos: o fixado na campanha, ou todos os agendáveis. */
function decoradosDoFormulario(schema: FormSchema): string[] {
  const fixo = schema.agenda?.local
  if (fixo && isBookableLocation(fixo)) return [fixo]
  return [...LOCATIONS]
}

// GET /api/formulario/[token]/agenda?date=YYYY-MM-DD → { locations, days, slots? }
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const form = await acharFormulario(token)
  if (!form) return NextResponse.json(TOKEN_INVALIDO, { status: 404 })

  const admin = createAdminClient()
  const grade = await gradeDaEquipe({
    supabase: admin,
    orgId: form.org_id,
    team: "house",
    date: new URL(request.url).searchParams.get("date"),
  })

  return NextResponse.json({
    locations: decoradosDoFormulario(form.schema),
    days: grade.days,
    ...(grade.slots ? { slots: grade.slots } : {}),
  })
}

// POST /api/formulario/[token]/agenda
// body: { session_token, scheduled_at, location }
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const form = await acharFormulario(token)
  if (!form) return NextResponse.json(TOKEN_INVALIDO, { status: 404 })

  const body = (await request.json().catch(() => null)) as {
    session_token?: string
    scheduled_at?: string
    location?: string
  } | null
  if (!body?.session_token || !UUID_RE.test(body.session_token)) {
    return NextResponse.json({ error: "Sessão inválida. Recomece o formulário." }, { status: 400 })
  }

  const admin = createAdminClient()

  // A resposta precisa existir, ser deste formulário e estar COMPLETA: agendar
  // sem ter terminado o formulário pularia a captação que é o ponto da 75-330.
  const { data: resposta } = await admin
    .from("lead_form_responses")
    .select("id, lead_id, status")
    .eq("session_token", body.session_token)
    .eq("form_id", form.id)
    .maybeSingle()

  if (!resposta || resposta.status !== "completa" || !resposta.lead_id) {
    return NextResponse.json({ error: "Termine o formulário antes de agendar." }, { status: 400 })
  }
  const leadId = resposta.lead_id as string

  // AC8 — idempotência: a mesma sessão não cria duas visitas. Reenvio (duplo
  // clique, retomada de aba) devolve a visita que já existe, em vez de ocupar
  // um segundo horário do decorado em nome do mesmo lead.
  const { data: jaExiste } = await admin
    .from("appointments")
    .select("id, scheduled_at, location")
    .eq("lead_id", leadId)
    .eq("org_id", form.org_id)
    .in("status", ["scheduled", "confirmed"])
    .limit(1)
    .maybeSingle()
  if (jaExiste) {
    return NextResponse.json({
      data: { scheduled_at: jaExiste.scheduled_at, location: jaExiste.location, ja_existia: true },
    })
  }

  const location = body.location?.trim() ?? ""
  if (!isBookableLocation(location) || !decoradosDoFormulario(form.schema).includes(location)) {
    return NextResponse.json({ error: "Selecione um decorado válido." }, { status: 400 })
  }

  const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null
  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Data/hora inválida." }, { status: 400 })
  }
  scheduledAt.setMinutes(scheduledAt.getMinutes() < 30 ? 0 : 30, 0, 0)
  if (scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Escolha um horário no futuro." }, { status: 400 })
  }

  const { week, timezone } = await getOrgSchedule(form.org_id, admin)
  if (!isValidImobSlot(scheduledAt, week, timezone)) {
    return NextResponse.json(
      { error: "Horário fora do expediente. Escolha um horário disponível." },
      { status: 400 }
    )
  }

  // AC3 — recheca o conflito no POST (a grade pode ter mudado enquanto a pessoa
  // escolhia). Corrida entre dois leads no mesmo slot → 409 amigável.
  const fim = new Date(scheduledAt.getTime() + DURACAO_MIN * 60_000)
  const ocupados = await ocupadosDaEquipe(
    admin,
    form.org_id,
    "house",
    new Date(scheduledAt.getTime() - 2 * 60 * 60_000).toISOString(),
    fim.toISOString()
  )
  const tomado = ocupados.some((b) => {
    const bIni = new Date(b.scheduled_at).getTime()
    return overlaps(scheduledAt.getTime(), fim.getTime(), bIni, bIni + (b.duration_minutes ?? 60) * 60_000)
  })
  if (tomado) {
    return NextResponse.json(
      { error: "Esse horário acabou de ser ocupado. Escolha outro horário." },
      { status: 409 }
    )
  }

  // AC5 — o lead passa a ser do SDR. `assigned_broker_id` referencia users(id),
  // apesar do nome. Sem SDR ativo, o lead fica sem responsável em vez de o
  // agendamento falhar: perder a visita é pior do que ficar sem dono.
  const { data: sdr } = await admin
    .from("users")
    .select("id")
    .eq("org_id", form.org_id)
    .eq("role", "sdr")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  const { data: lead } = await admin
    .from("leads")
    .select("name, phone, email")
    .eq("id", leadId)
    .maybeSingle()

  const { data: visita, error: erroVisita } = await admin
    .from("appointments")
    .insert({
      org_id: form.org_id,
      lead_id: leadId,
      broker_id: (sdr?.id as string | undefined) ?? null,
      property_id: PROPERTY_MAP[location]?.id ?? null,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: DURACAO_MIN,
      location,
      team: "house",
      status: "scheduled", // D1 — pré-agendada, e o horário já bloqueia
      created_by: "admin",
      client_name: (lead?.name as string | null) ?? null,
      client_phone: (lead?.phone as string | null) ?? null,
      client_email: (lead?.email as string | null) ?? null,
      metadata: { origem: "formulario_qualificacao", form_id: form.id, form_nome: form.nome },
    })
    .select("id, scheduled_at, duration_minutes, location")
    .single()

  if (erroVisita || !visita) {
    console.error("[formulario/agenda] falha ao criar visita:", erroVisita)
    return NextResponse.json({ error: "Não foi possível agendar. Tente novamente." }, { status: 500 })
  }

  // AC4 — a ordem importa: só DEPOIS da visita gravada o lead avança de etapa.
  // Ao contrário, um agendamento que falha deixaria o lead carimbado com visita
  // fantasma (lição da Story 75-196).
  await advanceToVisitaAgendada(admin, leadId)

  if (sdr?.id) {
    await admin.from("leads").update({ assigned_broker_id: sdr.id as string }).eq("id", leadId)
  }

  await mirrorCreate(
    admin,
    {
      id: visita.id,
      scheduled_at: visita.scheduled_at,
      duration_minutes: visita.duration_minutes,
      location: visita.location,
      notes: null,
      client_name: (lead?.name as string | null) ?? null,
      team: "house",
    },
    { origin: `Agendada pelo lead no formulário "${form.nome}".` }
  )

  await admin.from("activities").insert({
    org_id: form.org_id,
    lead_id: leadId,
    type: "appointment_created",
    description: `Visita agendada pelo próprio lead no formulário "${form.nome}" (${location})`,
    metadata: { appointment_id: visita.id, form_id: form.id, origem: "formulario_qualificacao" },
  })

  return NextResponse.json(
    { data: { scheduled_at: visita.scheduled_at, location: visita.location, timezone } },
    { status: 201 }
  )
}
