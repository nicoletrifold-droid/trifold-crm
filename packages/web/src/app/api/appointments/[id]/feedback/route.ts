import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"
import { applyNoShowFeedback, applyVisitFeedback } from "@web/lib/appointments/visit-feedback-core"

function getServiceClient() {
  return createAdminClient()
}

/** Story 75-185 — perfis que registram feedback de qualquer agendamento da org. */

/**
 * POST /api/appointments/[id]/feedback
 * Records visit feedback, updates appointment status, and creates activity log.
 *
 * Story 75-185 — endpoint era PÚBLICO (sem auth); agora exige sessão + org e
 * espelha a governança da 75-103: admin/supervisor/gerente-comercial sempre;
 * corretor só se for o dono do agendamento OU o responsável pelo lead.
 *
 * Body: {
 *   feedback: string,
 *   outcome?: "visited" | "no_show",   // Story 75-321 — default "visited"
 *   interest_after: "cold" | "warm" | "hot",   // exigido só quando outcome=visited
 *   next_steps: string
 * }
 *
 * Story 75-321 — `outcome: "no_show"` registra que o cliente não compareceu:
 * agendamento vira no_show, lead volta p/ a etapa de No-Show e a Nicole pós-visita
 * não dispara. Sem essa porta, a única saída do corretor era registrar como visita
 * realizada e corrigir a etapa na mão — que é como "Visitas realizadas" e o Funil
 * passaram a contar histórias diferentes.
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

    const supabase = getServiceClient()
    const body = await request.json()

    // Story 75-321 — desfecho do agendamento; ausente = "visited" (compatível com
    // os clientes antigos, que só sabiam registrar visita realizada).
    const outcome: "visited" | "no_show" = body.outcome === "no_show" ? "no_show" : "visited"
    if (body.outcome !== undefined && !["visited", "no_show"].includes(body.outcome)) {
      return NextResponse.json(
        { error: "outcome must be one of: visited, no_show" },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.feedback) {
      return NextResponse.json(
        { error: "feedback is required" },
        { status: 400 }
      )
    }

    // Nível de interesse só faz sentido quando houve visita — no no-show não há o
    // que avaliar, e exigir o campo empurraria o corretor de volta para a mentira.
    if (outcome === "visited" && (!body.interest_after || !["cold", "warm", "hot"].includes(body.interest_after))) {
      return NextResponse.json(
        { error: "interest_after must be one of: cold, warm, hot" },
        { status: 400 }
      )
    }

    // Verify appointment exists
    const { data: appointment, error: fetchError } = await supabase
      .from("appointments")
      .select("id, lead_id, org_id, status, broker_id, property_id, scheduled_at, team")
      .eq("id", id)
      .single()

    if (fetchError || !appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      )
    }

    // Story 75-185 — org + permissão (o client é service_role, então o check é manual)
    if (appointment.org_id !== appUser.org_id) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }
    // 75-307: registrar feedback de compromisso de TERCEIROS é a capability
    // agenda.feedback_visita; dono/lead-owner/imob-team seguem por identidade.
    if (!(await can(appUser.id, appUser.org_id, "agenda.feedback_visita"))) {
      const isApptOwner = appointment.broker_id === appUser.id
      // Story 75-201: perfil imob/consultoria registra feedback de visita da
      // equipe IMOB (mesma matriz da governança 81-3 — imob cuida do team imob).
      const isImobTeam =
        ["imob", "consultoria"].includes(appUser.role) && appointment.team === "imob"
      let isLeadOwner = false
      if (!isApptOwner && !isImobTeam) {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("assigned_broker_id")
          .eq("id", appointment.lead_id)
          .single()
        isLeadOwner = leadRow?.assigned_broker_id === appUser.id
      }
      if (!isApptOwner && !isImobTeam && !isLeadOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    if (outcome === "no_show") {
      const noShow = await applyNoShowFeedback(supabase, appointment, {
        feedback: body.feedback,
        next_steps: body.next_steps ?? null,
        actor_user_id: appUser.id,
      })
      if ("error" in noShow) {
        return NextResponse.json({ error: noShow.error }, { status: noShow.status })
      }
      return NextResponse.json({ data: { outcome: "no_show" } }, { status: 201 })
    }

    // Story 75-193 — ciclo completo extraído para visit-feedback-core (reuso
    // pela porta retroativa); comportamento inalterado.
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
