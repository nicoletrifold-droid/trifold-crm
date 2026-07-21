import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { requireAuth } from "@web/lib/api-auth"
import { applyVisitFeedback } from "@web/lib/appointments/visit-feedback-core"

function getServiceClient() {
  return createAdminClient()
}

/** Story 75-185 — perfis que registram feedback de qualquer agendamento da org. */
const FEEDBACK_ADMIN_ROLES = ["admin", "supervisor", "gerente-comercial"]

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
 *   interest_after: "cold" | "warm" | "hot",
 *   next_steps: string
 * }
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

    // Validate required fields
    if (!body.feedback) {
      return NextResponse.json(
        { error: "feedback is required" },
        { status: 400 }
      )
    }

    if (!body.interest_after || !["cold", "warm", "hot"].includes(body.interest_after)) {
      return NextResponse.json(
        { error: "interest_after must be one of: cold, warm, hot" },
        { status: 400 }
      )
    }

    // Verify appointment exists
    const { data: appointment, error: fetchError } = await supabase
      .from("appointments")
      .select("id, lead_id, org_id, status, broker_id, property_id, scheduled_at")
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
    if (!FEEDBACK_ADMIN_ROLES.includes(appUser.role)) {
      const isApptOwner = appointment.broker_id === appUser.id
      let isLeadOwner = false
      if (!isApptOwner) {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("assigned_broker_id")
          .eq("id", appointment.lead_id)
          .single()
        isLeadOwner = leadRow?.assigned_broker_id === appUser.id
      }
      if (!isApptOwner && !isLeadOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Story 75-193 — ciclo completo extraído para visit-feedback-core (reuso
    // pela porta retroativa); comportamento inalterado.
    const result = await applyVisitFeedback(supabase, appointment, {
      feedback: body.feedback,
      interest_after: body.interest_after,
      next_steps: body.next_steps ?? null,
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
