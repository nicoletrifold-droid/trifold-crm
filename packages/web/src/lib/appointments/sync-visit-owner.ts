import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { notifyBrokerOfAppointment } from "@web/lib/broker/notify-appointment"

/**
 * Story 75-247 / 75-249 — **a visita futura pertence a quem atende o lead.**
 *
 * Duas dores que são a mesma coisa:
 *
 * 1. A Nicole atende 24h e agenda visita ANTES da roleta distribuir. O
 *    appointment nasce com `broker_id = NULL` (o pipeline copia o dono do lead,
 *    que ainda não existe) e emite `APPOINTMENT_NO_BROKER`. Quando o lead ganhava
 *    dono, a visita ficava órfã para sempre — ninguém era notificado (lead
 *    Ailton, 30/07/2026, ver 75-245).
 * 2. O lead **troca de dono** (reatribuição, bolsão, transferência) e a visita
 *    ficava com o corretor antigo. Foi o que o Marcos pegou em 31/07: lead
 *    passou para o Matheus às 10:05 e a Agenda seguia mostrando a Thielly — que
 *    receberia o lembrete de WhatsApp da visita do dia seguinte
 *    (`appointment-whatsapp-reminders` e `appointment-email-reminders` leem
 *    `users!broker_id` DA VISITA, não o dono do lead).
 *
 * Decisão do Marcos (31/07/2026): *"quando eu transferir para outro corretor tem
 * que ir a visita para o novo corretor; as notificações e todo histórico vai
 * para o novo"*. Vale para **qualquer** troca de dono, não só o botão de
 * transferir — por isso esta função é chamada de todo caminho que mexe em
 * `leads.assigned_broker_id`.
 *
 * Os dois lados são avisados: quem recebe ("Lead novo COM visita marcada") e
 * quem perde ("Visita saiu da sua agenda") — senão o corretor antigo aparece
 * para um compromisso que não é mais dele.
 *
 * Escopo `team='house'`: visita IMOB nasce com `broker_id` nulo **de propósito**
 * (o dono é a imobiliária, em `imobiliaria_id`/`metadata.corretor_parceiro`) —
 * carimbar corretor da casa nela invadiria o mundo IMOB (Epic 81).
 *
 * Idempotente: visita que já é do dono não é tocada nem notificada. Best-effort:
 * nunca lança — falha aqui não pode derrubar distribuição nem atribuição de lead
 * (mesma política de notify-appointment.ts).
 */
export async function syncFutureVisitsWithLeadOwner(params: {
  admin: SupabaseClient
  orgId: string
  leadId: string
  /** Novo dono do lead (users.id). */
  brokerUserId: string
  /** Quem provocou a troca (roleta, bolsão, transferência…) — vai para a activity. */
  origem: string
}): Promise<{ moved: number }> {
  const { admin, orgId, leadId, brokerUserId, origem } = params
  if (!leadId || !brokerUserId) return { moved: 0 }

  try {
    // Lê antes de escrever: preciso do dono ANTERIOR de cada visita para avisá-lo.
    const { data: rows, error: readErr } = await admin
      .from("appointments")
      .select("id, broker_id, scheduled_at")
      .eq("lead_id", leadId)
      .eq("team", "house")
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString())

    if (readErr) {
      console.error("[sync-visit-owner] leitura falhou:", readErr)
      return { moved: 0 }
    }

    const toMove = (rows ?? []).filter((r) => (r.broker_id as string | null) !== brokerUserId)
    if (!toMove.length) return { moved: 0 }

    const { error: updErr } = await admin
      .from("appointments")
      .update({ broker_id: brokerUserId })
      .in("id", toMove.map((r) => r.id as string))

    if (updErr) {
      console.error("[sync-visit-owner] update falhou:", updErr)
      return { moved: 0 }
    }

    const { data: lead } = await admin
      .from("leads")
      .select("name, phone")
      .eq("id", leadId)
      .maybeSingle()

    for (const appt of toMove) {
      const whenStr = formatVisitWhen(appt.scheduled_at as string)
      const previousBrokerId = (appt.broker_id as string | null) ?? null

      await admin.from("activities").insert({
        org_id: orgId,
        lead_id: leadId,
        type: "appointment_updated",
        description: previousBrokerId
          ? `Visita de ${whenStr} passada para o novo responsável do lead (${origem}).`
          : `Visita de ${whenStr} atribuída ao responsável do lead (${origem}).`,
        metadata: {
          appointment_id: appt.id,
          from_broker_user_id: previousBrokerId,
          to_broker_user_id: brokerUserId,
          origem,
          synced_with_lead_owner: true,
        },
      })

      await notifyBrokerOfAppointment({
        orgId,
        brokerUserId,
        leadId,
        leadName: (lead?.name as string | null) ?? null,
        leadPhone: (lead?.phone as string | null) ?? null,
        variant: "inherited",
        whenStr,
      })

      if (previousBrokerId) {
        await notifyBrokerOfAppointment({
          orgId,
          brokerUserId: previousBrokerId,
          leadId,
          leadName: (lead?.name as string | null) ?? null,
          leadPhone: (lead?.phone as string | null) ?? null,
          variant: "moved_out",
          whenStr,
        })
      }
    }

    return { moved: toMove.length }
  } catch (err) {
    console.error("[sync-visit-owner] erro inesperado:", err)
    return { moved: 0 }
  }
}

/** "sáb., 01/08 às 10:00" — mesmo formato do aviso de visita no WhatsApp. */
export function formatVisitWhen(scheduledAt: string): string {
  const d = new Date(scheduledAt)
  const label = d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  // pt-BR devolve "sáb., 01/08, 10:00" — troca a última vírgula por " às".
  return label.replace(/,\s*(\d{2}:\d{2})$/, " às $1")
}
