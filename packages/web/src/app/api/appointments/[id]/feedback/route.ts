import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * Internal API for post-visit feedback.
 * Uses service role key for direct access.
 */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(url, key)
}

/**
 * POST /api/appointments/[id]/feedback
 * Records visit feedback, updates appointment status, and creates activity log.
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
      .select("id, lead_id, org_id, status")
      .eq("id", id)
      .single()

    if (fetchError || !appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      )
    }

    // Create visit feedback entry
    const { data: feedback, error: feedbackError } = await supabase
      .from("visit_feedback")
      .insert({
        appointment_id: id,
        lead_id: appointment.lead_id,
        org_id: appointment.org_id,
        feedback: body.feedback.trim(),
        interest_after: body.interest_after,
        next_steps: body.next_steps?.trim() || null,
      })
      .select()
      .single()

    if (feedbackError) {
      return NextResponse.json(
        { error: feedbackError.message },
        { status: 500 }
      )
    }

    // Update appointment status to completed
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Move lead to "Visitou" stage — only if in earlier stages (prevent regression)
    const { STAGE_IDS } = await import("@trifold/shared")
    const NON_REGRESSION_STAGES = [
      STAGE_IDS.novo, STAGE_IDS.em_qualificacao, STAGE_IDS.qualificado,
      STAGE_IDS.visita_agendada, STAGE_IDS.no_show,
    ]
    const { data: leadForStage } = await supabase
      .from("leads")
      .select("stage_id")
      .eq("id", appointment.lead_id)
      .single()

    if (leadForStage && NON_REGRESSION_STAGES.includes(leadForStage.stage_id)) {
      await supabase
        .from("leads")
        .update({ stage_id: STAGE_IDS.visitou })
        .eq("id", appointment.lead_id)
    }

    // Create activity log
    await supabase.from("activities").insert({
      org_id: appointment.org_id,
      lead_id: appointment.lead_id,
      type: "visit_completed",
      description: `Visita concluída. Interesse: ${body.interest_after}`,
      metadata: {
        appointment_id: id,
        feedback_id: feedback.id,
        interest_after: body.interest_after,
        next_steps: body.next_steps?.trim() || null,
      },
    })

    // Trigger Nicole post-visit follow-up based on interest level
    try {
      // Check if there's already a post_visit log for this lead in the last 48h
      const cooldown48h = new Date(Date.now() - 48 * 60 * 60 * 1000)
      const { data: existingPostVisit } = await supabase
        .from("follow_up_log")
        .select("id")
        .eq("lead_id", appointment.lead_id)
        .eq("type", "post_visit")
        .gte("created_at", cooldown48h.toISOString())
        .limit(1)

      if (!existingPostVisit || existingPostVisit.length === 0) {
        // Get property info from the appointment
        const { data: apptFull } = await supabase
          .from("appointments")
          .select("property_id, lead:leads!lead_id(name, ai_summary), property:properties!property_id(name)")
          .eq("id", id)
          .single()

        if (apptFull) {
          const leadInfo = Array.isArray(apptFull.lead) ? apptFull.lead[0] : apptFull.lead
          const propInfo = Array.isArray(apptFull.property) ? apptFull.property[0] : apptFull.property
          const leadName = (leadInfo as { name?: string } | null)?.name || ""
          const propName = (propInfo as { name?: string } | null)?.name || "o imovel"
          const aiSummary = (leadInfo as { ai_summary?: string } | null)?.ai_summary || undefined

          const { createAnthropicClient, generatePostVisitMessage } = await import("@trifold/ai")
          const anthropic = createAnthropicClient()

          const message = await generatePostVisitMessage({
            anthropic,
            leadName,
            propertyName: propName,
            visitFeedback: body.interest_after,
            aiSummary,
          })

          // Create follow_up_log entry
          await supabase.from("follow_up_log").insert({
            org_id: appointment.org_id,
            lead_id: appointment.lead_id,
            type: "post_visit",
            status: "sent",
            scheduled_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            message,
          })

          // Send message via conversation
          const { data: conversations } = await supabase
            .from("conversations")
            .select("id")
            .eq("lead_id", appointment.lead_id)
            .order("last_message_at", { ascending: false })
            .limit(1)

          if (conversations && conversations.length > 0) {
            await supabase.from("messages").insert({
              conversation_id: conversations[0].id,
              role: "assistant",
              content: message,
              metadata: { source: "post_visit_followup", appointment_id: id },
            })

            await supabase
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversations[0].id)
          }

          // Activity log
          await supabase.from("activities").insert({
            org_id: appointment.org_id,
            lead_id: appointment.lead_id,
            type: "followup_post_visit",
            description: `Nicole enviou follow-up pos-visita (interesse: ${body.interest_after})`,
            metadata: { appointment_id: id, feedback_id: feedback.id },
          })
        }
      }
    } catch (followupErr) {
      // Non-blocking: log but don't fail the feedback response
      console.error("Post-visit followup error:", followupErr)
    }

    return NextResponse.json({ data: feedback }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
