import { registroDoPosVisita } from "@web/lib/appointments/post-visit-record"
import { claimFollowUp, fecharClaim } from "@web/lib/followup/claim"
import { sendFollowUpMessage } from "@web/lib/whatsapp/send-followup-message"
import { logEventOnce } from "@web/lib/logger"
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
  /** Story 75-203: quem registrou o feedback (public.users.id) — carimba a
   * activity p/ a linha do tempo mostrar o autor em vez de "Sistema". */
  actor_user_id?: string | null
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
  // 🔥 Story 75-358 — `atendimento` é OBRIGATÓRIO nesta lista. Ela sempre continha
  // a `…0009`, só que pela chave `no_show` (que apontava para "Atendimento"). Com o
  // `no_show` agora sendo a etapa nova, deixar de nomear `atendimento` aqui faria o
  // lead em Atendimento — a etapa com 129 leads, o caminho mais usado — parar de
  // avançar para "Visitou" ao receber feedback de visita. Regressão silenciosa.
  const NON_REGRESSION_STAGES = [
    STAGE_IDS.novo, STAGE_IDS.em_qualificacao, STAGE_IDS.qualificado,
    STAGE_IDS.visita_agendada, STAGE_IDS.atendimento, STAGE_IDS.no_show,
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
    user_id: body.actor_user_id ?? null,
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
    // Story 75-352 — checar-e-depois-gravar virou um claim atômico. Esta porta é
    // humana (o corretor salvando o feedback) e pode acontecer no meio de uma run
    // do cron, que persegue exatamente o mesmo agendamento: as duas liam o
    // cooldown antes de qualquer uma escrever, e o lead levava a mensagem duas
    // vezes. O claim decide quem escreve — e vem antes da chamada ao modelo, que é
    // a parte cara.
    const claimPosVisita = await claimFollowUp({
      supabase,
      orgId: appointment.org_id,
      leadId: appointment.lead_id,
      type: "post_visit",
      metadata: { appointment_id: appointment.id, origem: "feedback_do_corretor" },
      blockingTypes: ["post_visit"],
    })

    if (claimPosVisita) {
      // Get property info from the appointment
      const { data: apptFull } = await supabase
        .from("appointments")
        .select("property_id, lead:leads!lead_id(name, phone, ai_summary), property:properties!property_id(name)")
        .eq("id", appointment.id)
        .single()

      if (apptFull) {
        const leadInfo = Array.isArray(apptFull.lead) ? apptFull.lead[0] : apptFull.lead
        const propInfo = Array.isArray(apptFull.property) ? apptFull.property[0] : apptFull.property
        const leadName = (leadInfo as { name?: string } | null)?.name || ""
        const propName = (propInfo as { name?: string } | null)?.name || "o imóvel"
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

        // Story 75-350 — ESTA PORTA NÃO MANDAVA NADA.
        //
        // Ela gravava `follow_up_log` com `status: "sent"` e `sent_at`, mais uma
        // linha em `messages`, e nunca chamava o WhatsApp: não havia envio aqui,
        // e não existe trigger em `messages` que envie (conferido em produção —
        // só `update_conversation_last_msg` e `bump_lead_last_contact`). O CRM
        // dizia "Nicole enviou follow-up pós-visita" e o lead não recebia nada.
        //
        // Agora usa o MESMO remetente do cron, que checa a janela de 24h do
        // WhatsApp antes de tentar. E a regra que o cron já documentava passa a
        // valer aqui: fora da janela o lead não recebeu texto livre, então NÃO se
        // persiste isso como mensagem entregue.
        const { data: convs } = await supabase
          .from("conversations")
          .select("id, last_message_at")
          .eq("lead_id", appointment.lead_id)
          .order("last_message_at", { ascending: false })
          .limit(1)

        const conv = convs && convs.length > 0 ? convs[0]! : null
        const leadPhone = (leadInfo as { phone?: string } | null)?.phone || ""

        const envio = await sendFollowUpMessage(
          supabase,
          appointment.org_id,
          leadPhone,
          message,
          conv?.last_message_at ?? null
        )

        // A decisão de "o que gravar" é a MESMA dos dois lados (post-visit-record).
        const registro = registroDoPosVisita(envio, body.interest_after)

        // Story 75-352 — a linha já existe desde o claim; aqui grava-se o desfecho.
        // O `throw` da 75-351 saiu: ele protegia o cooldown, e o cooldown agora é a
        // linha reivindicada, que já está no banco. `fecharClaim` grita se falhar.
        await fecharClaim(supabase, claimPosVisita, {
          status: registro.status,
          sentAt: registro.gravarSentAt ? new Date().toISOString() : null,
          message,
          metadata: {
            channel: envio.channel,
            appointment_id: appointment.id,
            origem: "feedback_do_corretor",
            ...(envio.reason ? { reason: envio.reason } : {}),
          },
        })

        if (registro.gravarMensagem && conv) {
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            role: "assistant",
            content: message,
            metadata: { source: "post_visit_followup", appointment_id: appointment.id, channel: envio.channel },
          })

          await supabase
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conv.id)
        }

        // Activity log — descreve o que ACONTECEU, não o que se pretendia.
        await supabase.from("activities").insert({
          org_id: appointment.org_id,
          lead_id: appointment.lead_id,
          type: "followup_post_visit",
          description: registro.descricao,
          metadata: {
            appointment_id: appointment.id,
            feedback_id: feedback.id,
            channel: envio.channel,
            sent: envio.sent,
            reason: envio.reason,
          },
        })
      }
    }
  } catch (followupErr) {
    // Story 75-350 — fail-open segue valendo (o feedback do corretor NÃO pode
    // falhar por causa do follow-up), mas invisível não. Este `catch` só fazia
    // `console.error`: quando o modelo do follow-up passou a devolver 404, os 17
    // feedbacks de 11/08 viraram ZERO mensagem sem uma linha no banco.
    //
    // `logEventOnce` (aguardado) e não `logEvent`: esta é a última escrita antes
    // do response, e em lambda o fire-and-forget morre no `return` (Story 87-6).
    await logEventOnce({
      level: "error",
      category: "ai",
      event_type: "POS_VISITA_FOLLOWUP_ERRO",
      message: `Follow-up pós-visita falhou no feedback do corretor: ${followupErr instanceof Error ? followupErr.message : String(followupErr)}`,
      metadata: {
        appointment_id: appointment.id,
        lead_id: appointment.lead_id,
        erro: followupErr instanceof Error ? followupErr.message : String(followupErr),
      },
      org_id: appointment.org_id,
      source: "lib/appointments/visit-feedback-core",
    })
  }

  return { feedback }
}

/**
 * Story 75-321 — porta "o cliente NÃO compareceu".
 *
 * Antes ela não existia: o corretor com uma visita pendente de feedback só tinha o
 * formulário de "visita realizada". Medido em prod (17/08/2026), o lead do
 * agendamento 732b3a72 recebeu um feedback cujo texto era "cli não compareceu,
 * tentando remarcar" — o sistema fez o que estava escrito no código (moveu para
 * Visitou) e 50 segundos depois o corretor arrastou o card de volta para
 * Atendimento na mão. Resultado: o agendamento contava como visita realizada no
 * Analytics e o lead não contava em Visitou. Os dois cards discordando por falta
 * de uma opção no formulário.
 *
 * Aqui o registro é honesto: agendamento vira `no_show`, o relato do corretor fica
 * na linha do tempo, o lead volta para a etapa de No-Show (a mesma que o detector
 * automático usa) e a Nicole pós-visita NÃO dispara — não houve visita.
 *
 * NÃO grava em `visit_feedback`: aquela tabela é o relato de uma visita que
 * aconteceu, e é ela que apaga o "pendente de feedback" das telas. Como o status
 * sai de (scheduled, confirmed, completed), o pendente some do mesmo jeito.
 */
export async function applyNoShowFeedback(
  supabase: SupabaseClient,
  appointment: AppointmentForFeedback,
  body: { feedback: string; next_steps?: string | null; actor_user_id?: string | null }
): Promise<{ ok: true } | { error: string; status: number }> {
  const { error: updateError } = await supabase
    .from("appointments")
    .update({ status: "no_show" })
    .eq("id", appointment.id)

  if (updateError) {
    return { error: updateError.message, status: 500 }
  }

  // Move para a etapa de No-Show — mas SÓ saindo de "Visita Agendada". Lead que já
  // avançou (visitou/proposta/…) não regride por causa de um agendamento antigo
  // marcado como ausência: é a mesma regra de não-regressão do fluxo de presença.
  const { STAGE_IDS } = await import("@trifold/shared")
  const { data: leadForStage } = await supabase
    .from("leads")
    .select("stage_id")
    .eq("id", appointment.lead_id)
    .single()

  if (leadForStage && leadForStage.stage_id === STAGE_IDS.visita_agendada) {
    await supabase
      .from("leads")
      .update({ stage_id: STAGE_IDS.no_show })
      .eq("id", appointment.lead_id)
  }

  const description = [
    "Cliente não compareceu à visita.",
    body.feedback.trim(),
    body.next_steps?.trim() ? `Próximos passos: ${body.next_steps.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  await supabase.from("activities").insert({
    org_id: appointment.org_id,
    lead_id: appointment.lead_id,
    user_id: body.actor_user_id ?? null,
    type: "appointment_no_show",
    description,
    metadata: {
      appointment_id: appointment.id,
      next_steps: body.next_steps?.trim() || null,
      // Registrado por gente, não pelo detector de 48h do cron.
      source: "manual",
    },
  })

  return { ok: true }
}
