import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"
import { applyVisitFeedback } from "@web/lib/appointments/visit-feedback-core"
import { buildVisitFeedbackList } from "@web/lib/appointments/visit-feedback-read"
import { mirrorCreate } from "@web/lib/appointments/google-mirror"

/** Mesma matriz do /api/appointments/[id]/feedback (75-185). */

interface LeadForFeedbackAccess {
  assigned_broker_id: string | null
  segmento: string | null
}

/**
 * Quem registra feedback também pode ler (Story 75-290): a régua é a MESMA do
 * POST — admin/supervisor/gerente-comercial/sdr sempre; corretor só no lead
 * dele; perfil imob/consultoria em lead do mundo IMOB (75-201).
 */
function canAccessFeedback(
  appUser: { id: string; role: string },
  lead: LeadForFeedbackAccess,
  // 75-307: can("agenda.feedback_visita") pré-computada pelo caller
  hasFeedbackCapability: boolean
): boolean {
  if (hasFeedbackCapability) return true
  if (lead.assigned_broker_id === appUser.id) return true
  return ["imob", "consultoria"].includes(appUser.role) && lead.segmento === "imob"
}

/**
 * GET /api/leads/[id]/visit-feedback — Story 75-290
 *
 * LEITURA do que já foi registrado. Chamada só quando o modal abre (lazy): o
 * estado do botão vem de quem o hospeda, que já calcula a régua "visita passada
 * sem feedback".
 *
 * O autor NÃO está em visit_feedback (a coluna broker_id referencia brokers(id),
 * não users(id)) — vem da activity `visit_completed` por metadata->>'feedback_id'
 * (75-203). Sem FK, nenhum embed PostgREST resolve: são 3 queries + casamento em
 * memória no visit-feedback-read.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { appUser } = auth

    const supabase = createAdminClient()

    // org_id no filtro: o admin client passa por cima da RLS.
    const { data: lead } = await supabase
      .from("leads")
      .select("id, assigned_broker_id, segmento")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }
    if (!canAccessFeedback(appUser, lead as LeadForFeedbackAccess, await can(appUser.id, appUser.org_id, "agenda.feedback_visita"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: feedbacks, error: feedbackError } = await supabase
      .from("visit_feedback")
      .select("id, visited_at, created_at, feedback, interest_after, next_steps")
      .eq("lead_id", id)

    if (feedbackError) {
      return NextResponse.json({ error: feedbackError.message }, { status: 500 })
    }
    if (!feedbacks || feedbacks.length === 0) {
      return NextResponse.json({ feedbacks: [] })
    }

    // Só `visit_completed`: a activity followup_post_visit da Nicole carrega o
    // MESMO feedback_id e user_id nulo (visit-feedback-core).
    const { data: activities } = await supabase
      .from("activities")
      .select("user_id, metadata")
      .eq("lead_id", id)
      .eq("type", "visit_completed")

    const authorIds = [
      ...new Set((activities ?? []).map((a) => a.user_id).filter((v): v is string => !!v)),
    ]
    const userNames: Record<string, string | null> = {}
    if (authorIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name")
        .in("id", authorIds)
      for (const user of users ?? []) {
        userNames[user.id as string] = (user.name as string | null) ?? null
      }
    }

    return NextResponse.json({
      feedbacks: buildVisitFeedbackList(feedbacks, activities ?? [], userNames),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/leads/[id]/visit-feedback — Story 75-193
 *
 * Porta RETROATIVA de registro de visita: lead que visitou SEM agendamento no
 * sistema (visita combinada por fora, walk-in, ou no-show que compareceu em
 * outra data). Cria um agendamento retroativo e dispara o MESMO ciclo do
 * feedback normal (visit_feedback + completed + etapa + Nicole pós-visita),
 * via visit-feedback-core.
 *
 * Body: { feedback, interest_after: cold|warm|hot, next_steps?, visited_at? (ISO) }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { appUser } = auth

    const supabase = createAdminClient()
    const body = await request.json()

    if (!body.feedback) {
      return NextResponse.json({ error: "feedback is required" }, { status: 400 })
    }
    if (!body.interest_after || !["cold", "warm", "hot"].includes(body.interest_after)) {
      return NextResponse.json(
        { error: "interest_after must be one of: cold, warm, hot" },
        { status: 400 }
      )
    }

    // visited_at opcional: nunca no futuro
    let visitedAt = new Date()
    if (body.visited_at) {
      const parsed = new Date(body.visited_at)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "visited_at inválido" }, { status: 400 })
      }
      if (parsed.getTime() > Date.now()) {
        return NextResponse.json(
          { error: "visited_at não pode ser no futuro" },
          { status: 400 }
        )
      }
      visitedAt = parsed
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("id, org_id, name, assigned_broker_id, property_interest_id, segmento")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .single()

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    // Permissão: admin/supervisor/gerente-comercial sempre; corretor só dono do
    // lead; perfil imob/consultoria em lead do mundo IMOB (Story 75-201).
    // Story 75-290: mesma régua do GET, uma única fonte (canAccessFeedback).
    if (!canAccessFeedback(appUser, lead as LeadForFeedbackAccess, await can(appUser.id, appUser.org_id, "agenda.feedback_visita"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Guard: se já existe visita PASSADA pendente de feedback, é ela que deve
    // ser usada (porta normal) — evita agendamento retroativo duplicado.
    const { data: pendingAppts } = await supabase
      .from("appointments")
      .select("id, feedback:visit_feedback(id)")
      .eq("lead_id", id)
      .in("status", ["scheduled", "confirmed", "completed"])
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(3)
    const pending = (pendingAppts ?? []).find((a) => {
      const fb = Array.isArray(a.feedback) ? a.feedback : a.feedback ? [a.feedback] : []
      return fb.length === 0
    })
    if (pending) {
      return NextResponse.json(
        {
          error: "Este lead tem uma visita agendada pendente de feedback — registre por ela.",
          pending_appointment_id: pending.id,
        },
        { status: 409 }
      )
    }

    // Agendamento retroativo — fica registrado que a visita não teve agendamento prévio.
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .insert({
        org_id: lead.org_id,
        lead_id: lead.id,
        broker_id: lead.assigned_broker_id ?? (appUser.role === "broker" ? appUser.id : null),
        property_id: lead.property_interest_id ?? null,
        scheduled_at: visitedAt.toISOString(),
        status: "confirmed",
        // Story 75-201: lead do mundo IMOB gera visita na agenda IMOB — sem isso
        // o default do banco ('house') sujava a agenda da house (Epic 81).
        team: lead.segmento === "imob" ? "imob" : "house",
        created_by: appUser.role === "broker" ? "broker" : "admin",
        notes: "Visita registrada retroativamente (sem agendamento prévio no sistema)",
      })
      .select("id, lead_id, org_id, property_id, scheduled_at, duration_minutes")
      .single()

    if (apptError || !appointment) {
      return NextResponse.json(
        { error: apptError?.message ?? "Falha ao criar o agendamento retroativo" },
        { status: 500 }
      )
    }

    // Story 75-275 — visita RETROATIVA também espelha ("tudo que for pra agenda
    // espelha", decisão do Marcos). O horário é passado, então não gera café nenhum:
    // serve para o calendário contar a mesma história que o CRM quando alguém olha para
    // trás. Best-effort, nunca derruba o feedback já registrado.
    await mirrorCreate(
      supabase,
      {
        id: appointment.id,
        scheduled_at: appointment.scheduled_at,
        // Do banco, NÃO literal: o insert retroativo não define duração, então vale o
        // default da coluna (30). Cravar 60 aqui faria o evento no Google durar o dobro
        // do que o CRM diz — as duas telas contando histórias diferentes.
        duration_minutes: appointment.duration_minutes,
        location: null,
        notes: "Visita registrada retroativamente (sem agendamento prévio no sistema)",
        client_name: lead.name ?? null,
        team: lead.segmento === "imob" ? "imob" : "house",
      },
      { origin: "Registro retroativo." }
    )

    const result = await applyVisitFeedback(supabase, appointment, {
      feedback: body.feedback,
      interest_after: body.interest_after,
      next_steps: body.next_steps ?? null,
      actor_user_id: appUser.id, // Story 75-203: autor na linha do tempo
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ data: result.feedback }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
