import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { notifyBrokerOfAppointment } from "@web/lib/broker/notify-appointment"

/**
 * Story 75-247 — visita órfã ganha dono junto com o lead.
 *
 * A Nicole atende 24h e agenda visita ANTES da roleta distribuir o lead. Nesse
 * caso o appointment nasce com `broker_id = NULL` (o pipeline só copia o dono do
 * lead, que ainda não existe) e emite `APPOINTMENT_NO_BROKER` — ninguém é
 * notificado. Quando a roleta (ou um gestor) finalmente dá um dono ao lead, a
 * visita continuava órfã: o corretor recebia "novo lead" sem saber que já havia
 * visita marcada. Foi o caso do lead Ailton (30/07/2026, ver 75-245).
 *
 * Esta função carimba o corretor nas visitas FUTURAS do lead que estão sem dono
 * e avisa o corretor de cada uma. É **idempotente e no-op** quando não há órfã:
 * o filtro `broker_id IS NULL` garante que ela nunca rouba visita de ninguém —
 * por isso pode ser chamada de qualquer caminho que atribua dono sem risco de
 * efeito colateral. Transferência de lead usa `transferHouseVisitsToBroker`
 * (abaixo), que MOVE a visita mesmo tendo dono.
 *
 * Escopo `team='house'`: visita IMOB nasce com `broker_id` nulo **de propósito**
 * (o dono é a imobiliária, em `imobiliaria_id`/`metadata.corretor_parceiro`) —
 * carimbar corretor da casa nela invadiria o mundo IMOB (Epic 81).
 *
 * Best-effort: nunca lança. Falha de notificação não pode derrubar a
 * distribuição de lead (mesma política de notify-appointment.ts).
 */
export async function claimOrphanVisitsForBroker(params: {
  admin: SupabaseClient
  orgId: string
  leadId: string
  brokerUserId: string
  /** Quem provocou a atribuição (roleta, bolsão, gestor) — vai para a activity. */
  origem: string
}): Promise<{ claimed: number }> {
  const { admin, orgId, leadId, brokerUserId, origem } = params
  if (!leadId || !brokerUserId) return { claimed: 0 }

  try {
    const { data: claimed, error } = await admin
      .from("appointments")
      .update({ broker_id: brokerUserId })
      .eq("lead_id", leadId)
      .eq("team", "house")
      .is("broker_id", null)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date().toISOString())
      .select("id, scheduled_at")

    if (error) {
      console.error("[claim-orphan-visits] update falhou:", error)
      return { claimed: 0 }
    }
    if (!claimed?.length) return { claimed: 0 }

    const { data: lead } = await admin
      .from("leads")
      .select("name, phone")
      .eq("id", leadId)
      .maybeSingle()

    for (const appt of claimed) {
      const whenStr = formatVisitWhen(appt.scheduled_at as string)

      await admin.from("activities").insert({
        org_id: orgId,
        lead_id: leadId,
        type: "appointment_updated",
        description: `Visita de ${whenStr} atribuída ao corretor junto com o lead (${origem}).`,
        metadata: { appointment_id: appt.id, broker_user_id: brokerUserId, origem, claimed_orphan: true },
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
    }

    return { claimed: claimed.length }
  } catch (err) {
    console.error("[claim-orphan-visits] erro inesperado:", err)
    return { claimed: 0 }
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

/**
 * Story 75-247 — TRANSFERÊNCIA de lead: a visita vai com o lead.
 *
 * Decisão do Marcos (31/07/2026): "quando eu transferir para outro corretor, tem
 * que ir a visita para o novo corretor; as notificações e todo histórico vai
 * para o novo". Diferente do claim acima, aqui a visita muda de mão **mesmo
 * tendo dono** — é troca de responsável, não adoção de órfã.
 *
 * O corretor ANTIGO é avisado: o compromisso sai da agenda dele e ele não pode
 * descobrir isso aparecendo para uma visita que não é mais sua.
 *
 * Escopo `team='house'` pelo mesmo motivo do claim: visita IMOB pertence à
 * imobiliária, não a um corretor da casa.
 */
export async function transferHouseVisitsToBroker(params: {
  admin: SupabaseClient
  orgId: string
  leadId: string
  toBrokerUserId: string
  origem: string
}): Promise<{ moved: number }> {
  const { admin, orgId, leadId, toBrokerUserId, origem } = params
  if (!leadId || !toBrokerUserId) return { moved: 0 }

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
      console.error("[transfer-visits] leitura falhou:", readErr)
      return { moved: 0 }
    }

    const toMove = (rows ?? []).filter((r) => (r.broker_id as string | null) !== toBrokerUserId)
    if (!toMove.length) return { moved: 0 }

    const { error: updErr } = await admin
      .from("appointments")
      .update({ broker_id: toBrokerUserId })
      .in("id", toMove.map((r) => r.id as string))

    if (updErr) {
      console.error("[transfer-visits] update falhou:", updErr)
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
        description: `Visita de ${whenStr} transferida junto com o lead (${origem}).`,
        metadata: {
          appointment_id: appt.id,
          from_broker_user_id: previousBrokerId,
          to_broker_user_id: toBrokerUserId,
          origem,
          transferred_with_lead: true,
        },
      })

      await notifyBrokerOfAppointment({
        orgId,
        brokerUserId: toBrokerUserId,
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
    console.error("[transfer-visits] erro inesperado:", err)
    return { moved: 0 }
  }
}
