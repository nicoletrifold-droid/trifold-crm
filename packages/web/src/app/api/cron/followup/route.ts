import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"
import { notifyBrokerOfStalledLead } from "@web/lib/broker/notify-stalled-lead"
import { isWithinWhatsAppWindow } from "@web/lib/broker/dispatch-broker-message"
import { sendWhatsAppMessage } from "@web/lib/whatsapp/send-whatsapp-message"

const CRON_SECRET = process.env.CRON_SECRET
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

/**
 * Result of a follow-up send attempt.
 * - `sent`   → whether the message reached the channel
 * - `channel`→ "telegram" | "whatsapp" (for logging / activity copy)
 * - `reason` → stable skip/error code when `sent=false`
 *              (WHATSAPP_WINDOW_CLOSED | WHATSAPP_CONFIG_MISSING | TELEGRAM_TOKEN_MISSING | API_ERROR | UNSUPPORTED_CHANNEL)
 */
interface FollowUpSendResult {
  sent: boolean
  channel: "telegram" | "whatsapp"
  reason?: string
  /** Original transport error string when reason === "API_ERROR". */
  error?: string
}

/**
 * Send a follow-up message to the lead via the correct channel.
 *
 * Channel detection (AC1):
 *  - phone starts with "tg:" → Telegram (Bot API) — behaviour PRESERVED (AC2)
 *  - otherwise               → WhatsApp Cloud API (AC3)
 *
 * WhatsApp 24h freeform window (AC3/AC4): freeform text can only be sent within
 * 24h of the lead's last message. The window is checked via
 * `conversations.last_message_at` (AC6) using `isWithinWhatsAppWindow` (reused
 * from Story 51-1). Outside the window, NO message is attempted and the result
 * is `{ sent: false, reason: 'WHATSAPP_WINDOW_CLOSED' }` so the caller can mark
 * the `follow_up_log` as `status='skipped'`. Approved templates (HSM) for the
 * out-of-window case are explicit backlog (see story "Backlog para Templates").
 *
 * Credentials come from the `whatsapp_config` table (org_id + status='active'),
 * NOT env vars (AC7) — same pattern as appointment-whatsapp-reminders / notify-broker.
 *
 * Never throws: any transport failure returns `{ sent: false, reason: 'API_ERROR' }`
 * so the cron loop is best-effort and a single lead cannot break the run (AC5).
 */
async function sendFollowUpMessage(
  supabase: SupabaseClient,
  orgId: string,
  phone: string,
  message: string,
  conversationLastMessageAt: Date | string | null,
  now: Date = new Date()
): Promise<FollowUpSendResult> {
  // --- Telegram branch (AC2): preserved verbatim ---
  if (phone.startsWith("tg:")) {
    if (!TELEGRAM_BOT_TOKEN) {
      console.error("[FOLLOWUP] TELEGRAM_BOT_TOKEN not configured — message not sent")
      return { sent: false, channel: "telegram", reason: "TELEGRAM_TOKEN_MISSING" }
    }

    const chatId = phone.replace("tg:", "")

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message }),
          signal: AbortSignal.timeout(30000),
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[FOLLOWUP] Telegram API error ${res.status}: ${errText}`)
        return { sent: false, channel: "telegram", reason: "API_ERROR", error: `HTTP_${res.status}` }
      }

      return { sent: true, channel: "telegram" }
    } catch (err) {
      console.error("[FOLLOWUP] Telegram send failed:", err)
      return { sent: false, channel: "telegram", reason: "API_ERROR", error: String(err) }
    }
  }

  // --- WhatsApp branch (AC3/AC4) ---
  // Check the 24h freeform window BEFORE attempting any send (AC4/AC6).
  if (!isWithinWhatsAppWindow(conversationLastMessageAt, now)) {
    return { sent: false, channel: "whatsapp", reason: "WHATSAPP_WINDOW_CLOSED" }
  }

  // Resolve credentials from whatsapp_config by org (AC7) — NOT env vars.
  const { data: waConfig } = await supabase
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    return { sent: false, channel: "whatsapp", reason: "WHATSAPP_CONFIG_MISSING" }
  }

  const result = await sendWhatsAppMessage(waConfig, phone, message)

  if (!result.sent) {
    return { sent: false, channel: "whatsapp", reason: "API_ERROR", error: result.error }
  }

  return { sent: true, channel: "whatsapp" }
}

/**
 * Follow-up cron engine.
 * GET /api/cron/followup (Vercel Cron sends GET requests)
 *
 * For each active follow_up_rule:
 * - Find leads in that stage where last message is older than alert_days / nicole_takeover_days
 * - If broker hasn't sent a message since last lead/Nicole message:
 *   - alert_days exceeded → create follow_up_log entry type='alert_broker'
 *   - nicole_takeover_days exceeded → render template, send via Telegram, create log type='nicole_sent'
 * - Respect: max 1 followup per lead per 48h, business hours only
 */
export async function GET(request: NextRequest) {
  // Validate cron secret — fail-closed
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not configured — endpoint blocked")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const now = new Date()
  const currentHour = now.getUTCHours() - 3 // BRT offset
  const normalizedHour = currentHour < 0 ? currentHour + 24 : currentHour

  // Business hours: 8h-20h BRT
  if (normalizedHour < 8 || normalizedHour >= 20) {
    return NextResponse.json({
      processed: 0,
      alerts_created: 0,
      messages_sent: 0,
      skipped_reason: "outside_business_hours",
    })
  }

  let alertsCreated = 0
  let messagesSent = 0
  let processed = 0

  // Fetch all active follow-up rules with stage info
  const { data: rules, error: rulesError } = await supabase
    .from("follow_up_rules")
    .select("*, stage:kanban_stages(id, name, slug)")
    .eq("is_active", true)

  if (rulesError || !rules) {
    return NextResponse.json(
      { error: rulesError?.message ?? "No rules found" },
      { status: 500 }
    )
  }

  for (const rule of rules) {
    const stageArr = rule.stage as unknown as Array<{ id: string; name: string; slug: string }> | null
    const stage = Array.isArray(stageArr) ? stageArr[0] : stageArr

    if (!stage) continue

    // Find leads in this stage
    const { data: leads } = await supabase
      .from("leads")
      .select(
        `id, name, phone, org_id, assigned_broker_id, property_interest_id,
         properties:property_interest_id(name)`
      )
      .eq("org_id", rule.org_id)
      .eq("stage_id", rule.stage_id)
      .eq("is_active", true)

    if (!leads || leads.length === 0) continue

    const leadIds = leads.map((l) => l.id)
    const cooldownDate = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    // Batch: fetch all leads in cooldown with a single query
    const { data: inCooldown } = await supabase
      .from("follow_up_log")
      .select("lead_id")
      .in("lead_id", leadIds)
      .gte("created_at", cooldownDate.toISOString())

    const cooldownSet = new Set((inCooldown ?? []).map((r) => r.lead_id))
    const eligibleLeads = leads.filter((l) => !cooldownSet.has(l.id))

    if (eligibleLeads.length === 0) continue

    // Batch: fetch latest conversation per eligible lead in one query.
    // last_message_at is the source of truth for the WhatsApp 24h window (AC6).
    const eligibleIds = eligibleLeads.map((l) => l.id)
    const { data: allConversations } = await supabase
      .from("conversations")
      .select("id, lead_id, last_message_at")
      .in("lead_id", eligibleIds)
      .order("last_message_at", { ascending: false })

    const latestConvByLead = new Map<string, { id: string; last_message_at: string | null }>()
    for (const conv of allConversations ?? []) {
      if (!latestConvByLead.has(conv.lead_id)) {
        latestConvByLead.set(conv.lead_id, { id: conv.id, last_message_at: conv.last_message_at })
      }
    }

    for (const lead of eligibleLeads) {
      processed++

      const latestConv = latestConvByLead.get(lead.id)
      const conversationId = latestConv?.id
      const conversationLastMessageAt = latestConv?.last_message_at ?? null

      if (!conversationId) continue

      // Get the last message from the conversation
      const { data: lastMessages } = await supabase
        .from("messages")
        .select("role, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10)

      if (!lastMessages || lastMessages.length === 0) continue

      const lastMessage = lastMessages[0]!
      const lastMessageDate = new Date(lastMessage.created_at)
      const daysSinceLastMessage =
        (now.getTime() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24)

      // Check if broker sent a message in the last 24h — if yes, broker owns the conversation until tomorrow
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const brokerSentRecently = lastMessages.some(
        (m) => m.role === "broker" && new Date(m.created_at) > oneDayAgo
      )

      if (brokerSentRecently) continue // Broker is handling, skip follow-up

      // Resolve property name for template
      const propertyArr = lead.properties as unknown as Array<{ name: string }> | null
      const propertyName = Array.isArray(propertyArr)
        ? propertyArr[0]?.name ?? "seu imovel"
        : (propertyArr as { name: string } | null)?.name ?? "seu imovel"

      // Check nicole_takeover_days first (more severe)
      if (daysSinceLastMessage >= rule.nicole_takeover_days) {
        // Render template
        const message = (rule.message_template || "")
          .replace(/\{nome\}/g, lead.name || "")
          .replace(/\{empreendimento\}/g, propertyName)

        // Send via the correct channel (Telegram or WhatsApp). The 24h WhatsApp
        // window is checked inside; outside it, nothing is sent (AC4).
        const result = await sendFollowUpMessage(
          supabase,
          rule.org_id,
          lead.phone,
          message,
          conversationLastMessageAt,
          now
        )

        // follow_up_log status reflects the send outcome (AC4/T3):
        //  - sent ok                  → status='sent'
        //  - WhatsApp window closed   → status='skipped' + metadata.reason
        //  - other failure (best-effort) → status='sent' (message stored, retry by broker)
        const skipped = !result.sent && result.reason === "WHATSAPP_WINDOW_CLOSED"
        await supabase.from("follow_up_log").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          rule_id: rule.id,
          type: "nicole_sent",
          status: skipped ? "skipped" : "sent",
          scheduled_at: now.toISOString(),
          sent_at: result.sent ? now.toISOString() : null,
          message,
          metadata: skipped ? { reason: result.reason, channel: result.channel } : { channel: result.channel },
        })

        if (result.sent) {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_MESSAGE_SENT",
            message: `Follow-up sent to lead ${lead.id} via ${result.channel}`,
            metadata: { lead_id: lead.id, type: "nicole_sent", stage: stage.name, channel: result.channel },
            source: "api/cron/followup",
          })
        } else {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_MESSAGE_SKIPPED",
            message: `Follow-up NOT sent to lead ${lead.id} via ${result.channel}: ${result.reason}`,
            metadata: { lead_id: lead.id, type: "nicole_sent", stage: stage.name, channel: result.channel, reason: result.reason },
            source: "api/cron/followup",
          })
        }

        // For the WhatsApp window-closed case the lead never received freeform
        // text, so we must NOT persist it as a delivered assistant message.
        if (!skipped) {
          // Save message to conversation history (regardless of transport send status)
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: message,
            metadata: { source: "followup_cron", rule_id: rule.id, channel: result.channel, sent: result.sent },
          })

          // Update conversation timestamp
          await supabase
            .from("conversations")
            .update({ last_message_at: now.toISOString() })
            .eq("id", conversationId)
        }

        // Create activity log
        const activityDesc = result.sent
          ? `Nicole enviou follow-up automatico na etapa "${stage.name}" (${result.channel})`
          : skipped
            ? `Nicole NAO enviou follow-up (WhatsApp fora da janela de 24h) na etapa "${stage.name}"`
            : `Nicole tentou follow-up na etapa "${stage.name}" (${result.channel}, envio pendente)`
        await supabase.from("activities").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          type: "followup_nicole_sent",
          description: activityDesc,
          metadata: { rule_id: rule.id, stage_id: rule.stage_id, channel: result.channel, sent: result.sent, reason: result.reason },
        })

        messagesSent++
      } else if (daysSinceLastMessage >= rule.alert_days) {
        // Create alert for broker
        await supabase.from("follow_up_log").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          rule_id: rule.id,
          type: "alert_broker",
          status: "pending",
          scheduled_at: now.toISOString(),
        })

        // Create activity log
        await supabase.from("activities").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          type: "followup_alert_broker",
          description: `Alerta de follow-up: lead sem contato ha ${Math.floor(daysSinceLastMessage)} dia(s) na etapa "${stage.name}"`,
          metadata: { rule_id: rule.id, stage_id: rule.stage_id },
        })

        // Story 51-4 (Gatilho B): notify the responsible broker that Nicole's
        // follow-ups are exhausted and the lead is not responding. Best-effort —
        // helper never throws, so a notification failure cannot break this loop.
        const notified = await notifyBrokerOfStalledLead({
          supabase,
          orgId: rule.org_id,
          assignedBrokerId: (lead as { assigned_broker_id?: string | null }).assigned_broker_id ?? null,
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          daysSinceLastMessage,
        })

        logEvent({
          level: "info",
          category: "cron",
          event_type: "FOLLOWUP_ALERT_BROKER",
          message: `alert_broker for lead ${lead.id} — broker notified: ${notified}`,
          metadata: { lead_id: lead.id, notified, stage: stage.name },
          source: "api/cron/followup",
        })

        alertsCreated++
      }
    }
  }

  // --- No-show detection ---
  const noShowDetected = await processNoShowDetection(supabase, now)

  // --- Post-visit follow-up ---
  // Find completed appointments with no post_visit follow-up log in the last 48h
  let postVisitSent = 0

  const { data: completedAppointments } = await supabase
    .from("appointments")
    .select(
      `id, lead_id, org_id, property_id,
       lead:leads!lead_id(id, name, phone, ai_summary),
       property:properties!property_id(id, name),
       feedback:visit_feedback(interest_after, feedback)`
    )
    .eq("status", "completed")

  if (completedAppointments) {
    const cooldown48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    for (const appt of completedAppointments) {
      const leadData = Array.isArray(appt.lead) ? appt.lead[0] : appt.lead
      if (!leadData) continue

      // Check if there's already a post_visit log in the last 48h
      const { data: existingLog } = await supabase
        .from("follow_up_log")
        .select("id")
        .eq("lead_id", appt.lead_id)
        .eq("type", "post_visit")
        .gte("created_at", cooldown48h.toISOString())
        .limit(1)

      if (existingLog && existingLog.length > 0) continue

      // Get feedback info
      const feedbackArr = Array.isArray(appt.feedback) ? appt.feedback : appt.feedback ? [appt.feedback] : []
      const feedbackEntry = feedbackArr[0] as { interest_after?: string; feedback?: string } | undefined
      const interestLevel = feedbackEntry?.interest_after
      const visitFeedback = interestLevel || undefined

      // Get property name
      const propertyData = Array.isArray(appt.property) ? appt.property[0] : appt.property
      const propName = (propertyData as { name?: string } | null)?.name ?? "o imovel"

      // Generate Nicole message
      const { createAnthropicClient } = await import("@trifold/ai")
      const anthropic = createAnthropicClient()
      const { generatePostVisitMessage } = await import("@trifold/ai")

      const message = await generatePostVisitMessage({
        anthropic,
        leadName: leadData.name || "",
        propertyName: propName,
        visitFeedback,
        aiSummary: (leadData as { ai_summary?: string }).ai_summary || undefined,
      })

      // Fetch the latest conversation BEFORE sending so we can check the
      // WhatsApp 24h window via conversations.last_message_at (AC6).
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, last_message_at")
        .eq("lead_id", appt.lead_id)
        .order("last_message_at", { ascending: false })
        .limit(1)

      const postVisitConv = conversations && conversations.length > 0 ? conversations[0]! : null
      const postVisitLastMessageAt = postVisitConv?.last_message_at ?? null

      // Send via the correct channel (Telegram or WhatsApp). The 24h WhatsApp
      // window is checked inside; outside it, nothing is sent (AC4).
      const leadPhone = (leadData as { phone?: string }).phone || ""
      const result = await sendFollowUpMessage(
        supabase,
        appt.org_id,
        leadPhone,
        message,
        postVisitLastMessageAt,
        now
      )

      const skipped = !result.sent && result.reason === "WHATSAPP_WINDOW_CLOSED"

      // Create follow_up_log entry reflecting the send outcome (AC4/T3)
      await supabase.from("follow_up_log").insert({
        org_id: appt.org_id,
        lead_id: appt.lead_id,
        type: "post_visit",
        status: skipped ? "skipped" : "sent",
        scheduled_at: now.toISOString(),
        sent_at: result.sent ? now.toISOString() : null,
        message,
        metadata: skipped
          ? { reason: result.reason, channel: result.channel, appointment_id: appt.id }
          : { channel: result.channel, appointment_id: appt.id },
      })

      if (result.sent) {
        logEvent({
          level: "info",
          category: "cron",
          event_type: "FOLLOWUP_MESSAGE_SENT",
          message: `Post-visit follow-up sent to lead ${appt.lead_id} via ${result.channel}`,
          metadata: { lead_id: appt.lead_id, type: "post_visit", appointment_id: appt.id, channel: result.channel },
          source: "api/cron/followup",
        })
      } else {
        logEvent({
          level: "info",
          category: "cron",
          event_type: "FOLLOWUP_MESSAGE_SKIPPED",
          message: `Post-visit follow-up NOT sent to lead ${appt.lead_id} via ${result.channel}: ${result.reason}`,
          metadata: { lead_id: appt.lead_id, type: "post_visit", appointment_id: appt.id, channel: result.channel, reason: result.reason },
          source: "api/cron/followup",
        })
      }

      // For the WhatsApp window-closed case the lead never received freeform
      // text, so we must NOT persist it as a delivered assistant message.
      if (!skipped && postVisitConv) {
        const conversationId = postVisitConv.id

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: message,
          metadata: { source: "post_visit_followup", appointment_id: appt.id, channel: result.channel, sent: result.sent },
        })

        await supabase
          .from("conversations")
          .update({ last_message_at: now.toISOString() })
          .eq("id", conversationId)
      }

      // Activity log
      const postVisitDesc = result.sent
        ? `Nicole enviou follow-up pos-visita (interesse: ${interestLevel || "nao informado"}) (${result.channel})`
        : skipped
          ? `Nicole NAO enviou follow-up pos-visita (WhatsApp fora da janela de 24h, interesse: ${interestLevel || "nao informado"})`
          : `Nicole tentou follow-up pos-visita (${result.channel}, envio pendente)`
      await supabase.from("activities").insert({
        org_id: appt.org_id,
        lead_id: appt.lead_id,
        type: "followup_post_visit",
        description: postVisitDesc,
        metadata: { appointment_id: appt.id, channel: result.channel, sent: result.sent, reason: result.reason },
      })

      postVisitSent++
    }
  }

  // AC13: Log cron execution result
  logEvent({
    level: processed > 0 ? "info" : "info",
    category: "cron",
    event_type: "FOLLOWUP_EXECUTED",
    message: `Followup cron: ${processed} processed, ${alertsCreated} alerts, ${messagesSent} messages, ${postVisitSent} post-visit, ${noShowDetected} no-show`,
    metadata: { processed, alerts_created: alertsCreated, messages_sent: messagesSent, post_visit_sent: postVisitSent, no_show_detected: noShowDetected },
    source: "api/cron/followup",
  })

  return NextResponse.json({
    processed,
    alerts_created: alertsCreated,
    messages_sent: messagesSent,
    post_visit_sent: postVisitSent,
    no_show_detected: noShowDetected,
  })
}

import { STAGE_IDS } from "@trifold/shared"

const NO_SHOW_STAGE_ID = STAGE_IDS.no_show

/**
 * Detect appointments that are 48h+ past scheduled_at with no feedback.
 * Mark as no_show, move lead to No-Show stage, reset conversation state.
 */
async function processNoShowDetection(
  supabase: SupabaseClient,
  now: Date
): Promise<number> {
  const threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  const { data: staleAppointments } = await supabase
    .from("appointments")
    .select("id, lead_id, org_id, scheduled_at")
    .in("status", ["scheduled", "confirmed"])
    .lt("scheduled_at", threshold.toISOString())

  if (!staleAppointments || staleAppointments.length === 0) return 0

  let count = 0
  for (const appt of staleAppointments) {
    // Mark appointment as no_show
    await supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appt.id)

    // Move lead to No-Show stage
    await supabase
      .from("leads")
      .update({ stage_id: NO_SHOW_STAGE_ID })
      .eq("id", appt.lead_id)

    // Reset conversation state (visit_proposed + visit_availability)
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", appt.lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (conv) {
      const { data: state } = await supabase
        .from("conversation_state")
        .select("collected_data")
        .eq("conversation_id", conv.id)
        .single()

      if (state) {
        const cleaned = { ...(state.collected_data as Record<string, unknown>) }
        delete cleaned.visit_availability
        await supabase
          .from("conversation_state")
          .update({ visit_proposed: false, collected_data: cleaned })
          .eq("conversation_id", conv.id)
      }
    }

    // Activity log
    await supabase.from("activities").insert({
      org_id: appt.org_id,
      lead_id: appt.lead_id,
      type: "appointment_no_show",
      description: "Visita nao realizada — sem feedback do corretor apos 48h",
      metadata: { appointment_id: appt.id },
    })

    count++
  }

  return count
}
