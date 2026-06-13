import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { notifyBroker } from "@web/lib/roleta/notify-broker"

/**
 * Story 51-4 (Epic 51) — Notify the responsible broker when Nicole's follow-ups
 * are exhausted and the lead stopped responding (Gatilho B).
 *
 * Reuse > Create: this mirrors `notifyBrokerOfAppointment` (Story 51-3). It resolves
 * the broker (with manager/admin fallback), resolves org notify prefs from
 * `roleta_config`, runs an anti-spam guard, and forwards a custom `context` to the
 * shared `notifyBroker` path. The `context` param was added by Story 51-3 — this
 * story only consumes it.
 *
 * Business rule (CON): notifying the broker is NOT a handoff. Nicole stays active
 * on the lead (`is_ai_active` is never touched here).
 *
 * Best-effort: this function NEVER throws. A notification failure must not break the
 * follow-up cron loop (AC6); the caller wraps the alert_broker insert separately so
 * the log row and other leads in the loop keep processing.
 *
 * @returns `true` when a notification was actually dispatched, `false` when skipped
 *          (anti-spam hit, no recipient resolved, or notification failure).
 */
export interface NotifyStalledLeadParams {
  supabase: SupabaseClient
  orgId: string
  /** leads.assigned_broker_id stores a user_id (RLS migration 085). May be null. */
  assignedBrokerId: string | null
  leadId: string
  leadName: string | null
  leadPhone: string | null
  /** Whole days since the last message — used in the broker-facing copy. */
  daysSinceLastMessage: number
}

// The DB stores the manager role with a hyphen ("gerente-comercial"). See
// migrations 062/063/079/084 and widespread usage across the web app. The story
// AC text uses an underscore, but @po confirmed the hyphenated value is the real
// one in the database — using the underscore here would silently match no rows.
const FALLBACK_ROLES = ["gerente-comercial", "admin"] as const

const ANTISPAM_WINDOW_MS = 48 * 60 * 60 * 1000

export async function notifyBrokerOfStalledLead(
  params: NotifyStalledLeadParams
): Promise<boolean> {
  const {
    supabase,
    orgId,
    assignedBrokerId,
    leadId,
    leadName,
    leadPhone,
    daysSinceLastMessage,
  } = params

  try {
    // AC5 — anti-spam: do not notify if a non-completed alert_broker already exists
    // for this lead within the last 48h. The follow_up_log is the source of truth.
    // Note: the row this cron run just inserted will itself match, so we look for a
    // PRIOR alert by excluding rows created in the last few seconds is unnecessary —
    // the cron's own 48h cooldown (cooldownSet) already prevents re-entry per lead
    // per 48h. This guard is the safety net for any path that bypasses cooldown.
    const sinceIso = new Date(Date.now() - ANTISPAM_WINDOW_MS).toISOString()
    const { data: recentAlert } = await supabase
      .from("follow_up_log")
      .select("id, created_at")
      .eq("lead_id", leadId)
      .eq("type", "alert_broker")
      .neq("status", "completed")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })

    // The caller inserts the alert_broker row BEFORE invoking this helper, so at
    // least one matching row is expected. More than one row (or one created earlier
    // than this run) means a prior alert is still open → skip to avoid duplicate
    // notifications across consecutive cron runs.
    if (recentAlert && recentAlert.length > 1) {
      return false
    }

    // T3/AC4 — resolve recipient: assigned broker first, manager/admin as fallback.
    const recipient = await resolveRecipient(supabase, orgId, assignedBrokerId)

    if (!recipient?.email) {
      console.warn(
        `[stalled-lead-notify] no recipient with email for lead ${leadId} (broker=${assignedBrokerId ?? "none"}) — skipping notification`
      )
      return false
    }

    // Resolve org notification preferences from the same source the roulette uses.
    // Default to all channels enabled when absent: a stalled lead is a high-value
    // signal the broker should always see.
    const { data: cfg } = await supabase
      .from("roleta_config")
      .select("notify_push, notify_email, notify_whatsapp")
      .eq("org_id", orgId)
      .maybeSingle()

    const leadDisplayName = leadName ?? "O lead"
    const days = Math.max(0, Math.floor(daysSinceLastMessage))

    // AC2 — custom copy for the "follow-up exhausted" trigger. The shared
    // notifyBroker path applies this title/body to push, email and WhatsApp.
    await notifyBroker({
      orgId,
      broker: {
        userId: recipient.id,
        name: recipient.name ?? "",
        email: recipient.email,
        phone: recipient.phone ?? null,
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
        title: "Lead parado — ação necessária",
        body: `${leadDisplayName} está sem resposta há ${days} dia(s) após os follow-ups da Nicole. Ligue ou envie mensagem.`,
      },
    })

    return true
  } catch (err) {
    // AC6: best-effort — never break the follow-up cron loop.
    console.error("[stalled-lead-notify] failed to notify broker:", err)
    return false
  }
}

interface Recipient {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

/**
 * Resolve who should receive the stalled-lead notification.
 * 1. The assigned broker (user_id), if present and has an email.
 * 2. Fallback: first manager ("gerente-comercial") or admin in the org (AC4).
 * 3. None found → caller logs a warn and skips.
 */
async function resolveRecipient(
  supabase: SupabaseClient,
  orgId: string,
  assignedBrokerId: string | null
): Promise<Recipient | null> {
  if (assignedBrokerId) {
    const { data: broker } = await supabase
      .from("users")
      .select("id, name, email, phone")
      .eq("id", assignedBrokerId)
      .maybeSingle()

    if (broker?.email) {
      return {
        id: broker.id as string,
        name: (broker.name as string | null) ?? null,
        email: broker.email as string,
        phone: (broker.phone as string | null) ?? null,
      }
    }
    // Assigned broker has no email → fall through to manager/admin fallback so the
    // lead is never left unattended.
  }

  const { data: fallback } = await supabase
    .from("users")
    .select("id, name, email, phone")
    .eq("org_id", orgId)
    .in("role", FALLBACK_ROLES as unknown as string[])
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fallback?.email) {
    return {
      id: fallback.id as string,
      name: (fallback.name as string | null) ?? null,
      email: fallback.email as string,
      phone: (fallback.phone as string | null) ?? null,
    }
  }

  return null
}
