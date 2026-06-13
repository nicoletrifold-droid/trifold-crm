import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"
import { notifyBroker } from "@web/lib/roleta/notify-broker"

/**
 * Story 51-3 — Notify the assigned broker when Nicole schedules a visit (Gatilho A).
 *
 * Architectural boundary note:
 * `notifyBroker` lives in `@trifold/web` and depends on server-only code
 * (`createAdminClient`, push/email services). The Nicole pipeline lives in
 * `@trifold/ai`, which must NOT import server-only web code (inverted dependency).
 * Instead, the pipeline emits an `APPOINTMENT_CREATED` event with the broker/lead
 * metadata, and the web-side `onEvent` handler (webhook / telegram routes) calls
 * this helper. This keeps the package boundary clean and reuses the existing
 * notification path (Reuse > Create) and the emit/onEvent infra already in place.
 *
 * This function is best-effort: it never throws. A notification failure must not
 * break the scheduling flow (AC6) — the appointment is already persisted by the
 * pipeline before this runs.
 */
export interface NotifyAppointmentParams {
  orgId: string
  /** The broker's user_id (leads.assigned_broker_id stores user_id — RLS migration 085). */
  brokerUserId: string
  leadId: string
  leadName: string | null
  leadPhone: string | null
}

export async function notifyBrokerOfAppointment(
  params: NotifyAppointmentParams
): Promise<void> {
  const { orgId, brokerUserId, leadId, leadName, leadPhone } = params

  // AC3: no broker assigned → no notification.
  if (!brokerUserId) return

  try {
    const admin = createAdminClient()

    // Broker contact data — assigned_broker_id is a user_id, so look up `users`.
    const { data: broker } = await admin
      .from("users")
      .select("name, email, phone")
      .eq("id", brokerUserId)
      .maybeSingle()

    if (!broker?.email) {
      console.warn(
        `[appointment-notify] broker ${brokerUserId} has no email — skipping notification`
      )
      return
    }

    // Resolve org notification preferences from the same source the roulette uses.
    // Default to all channels enabled when no config exists: a scheduled visit is
    // the highest-intent signal and the broker should always be alerted.
    const { data: cfg } = await admin
      .from("roleta_config")
      .select("notify_push, notify_email, notify_whatsapp")
      .eq("org_id", orgId)
      .maybeSingle()

    const leadDisplayName = leadName ?? "O lead"

    await notifyBroker({
      orgId,
      broker: {
        userId: brokerUserId,
        name: (broker.name as string) ?? "",
        email: broker.email as string,
        phone: (broker.phone as string | null) ?? null,
      },
      lead: {
        id: leadId,
        name: leadName,
        phone: leadPhone ?? "",
      },
      config: {
        notify_push: cfg?.notify_push ?? true,
        notify_email: cfg?.notify_email ?? true,
        notify_whatsapp: cfg?.notify_whatsapp ?? true,
      },
      context: {
        title: "Visita Agendada!",
        body: `${leadDisplayName} agendou uma visita com a Nicole.`,
      },
    })
  } catch (err) {
    // AC6: best-effort — never break the scheduling flow.
    console.error("[appointment-notify] failed to notify broker:", err)
  }
}
