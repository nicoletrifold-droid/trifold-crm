import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-193 — núcleo do registro de feedback de visita, extraído SEM mudança
 * de comportamento de /api/appointments/[id]/feedback (75-185/188) para ser
 * reusado pela porta retroativa (/api/leads/[id]/visit-feedback).
 *
 * Ciclo completo: visit_feedback + appointment→completed + lead→Visitou (sem
 * regressão) + activity + pós-visita da Nicole (best-effort, nunca bloqueia).
 */

export interface VisitFeedbackBody {
  feedback: string
  interest_after: "cold" | "warm" | "hot"
  next_steps?: string | null
}

export interface AppointmentForFeedback {
  id: string
  lead_id: string
  org_id: string
  property_id: string | null
  scheduled_at: string | null
}

export async function applyVisitFeedback(
  supabase: SupabaseClient,
  appointment: AppointmentForFeedback,
  body: VisitFeedbackBody
): Promise<{ feedback: Record<string, unknown> } | { error: string; status: number }> {
  // Create visit feedback entry
  const { data: feedback, error: feedbackError } = await supabase
    .from("visit_feedback")
    .insert({
      appointment_id: appointment.id,
      lead_id: appointment.lead_id,
      org_id: appointment.org_id,
      // Story 75-188 — visited_at é NOT NULL e o empreendimento vem do
      // agendamento (nullable). broker_id fica de fora: visit_feedback.broker_id
      // referencia brokers(id), mas appointments.broker_id aponta para users(id).
      property_id: appointment.property_id ?? null,
      visited_at: appointment.scheduled_at ?? new Date().toISOString(),
      feedback: body.feedback.trim(),
      interest_after: body.interest_after,
      next_steps: body.next_steps?.trim() || null,
    })
    .select()
    .single()

  if (feedbackError) {
    return { error: feedbackError.message, status: 500 }
  }

  // Update appointment status to completed
  const { error: updateError } = await supabase
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", appointment.id)

  if (updateError) {
    return { error: updateError.message, status: 500 }
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

  // Create activity log — Story 75-202: o RELATO da visita vai na description
  // (é o que as linhas do tempo exibem; antes só o interesse aparecia e o texto
  // do formulário ficava invisível fora da Análise IA).
  const interestLabel =
    ({ hot: "quente", warm: "morno", cold: "frio" } as Record<string, string>)[
      body.interest_after
    ] ?? body.interest_after
  const description = [
    `Visita concluída. Interesse: ${interestLabel}`,
    body.feedback.trim(),
    body.next_steps?.trim() ? `Próximos passos: ${body.next_steps.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n")
  await supabase.from("activities").insert({
    org_id: appointment.org_id,
    lead_id: appointment.lead_id,
    type: "visit_completed",
    description,
    metadata: {
      appointment_id: appointment.id,
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
        .eq("id", appointment.id)
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
          const conversationId = conversations[0]!.id
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: message,
            metadata: { source: "post_visit_followup", appointment_id: appointment.id },
          })

          await supabase
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId)
        }

        // Activity log
        await supabase.from("activities").insert({
          org_id: appointment.org_id,
          lead_id: appointment.lead_id,
          type: "followup_post_visit",
          description: `Nicole enviou follow-up pos-visita (interesse: ${body.interest_after})`,
          metadata: { appointment_id: appointment.id, feedback_id: feedback.id },
        })
      }
    }
  } catch (followupErr) {
    // Non-blocking: log but don't fail the feedback response
    console.error("Post-visit followup error:", followupErr)
  }

  return { feedback }
}
