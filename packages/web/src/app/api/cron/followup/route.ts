import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"

const CRON_SECRET = process.env.CRON_SECRET
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

/**
 * Send a follow-up message to the lead via Telegram.
 * Skips silently if lead is not a Telegram user (phone doesn't start with "tg:").
 */
async function sendFollowUpMessage(phone: string, message: string): Promise<boolean> {
  if (!phone.startsWith("tg:")) {
    return false // Not a Telegram lead — skip
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error("[FOLLOWUP] TELEGRAM_BOT_TOKEN not configured — message not sent")
    return false
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
      return false
    }

    return true
  } catch (err) {
    console.error("[FOLLOWUP] Telegram send failed:", err)
    return false
  }
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
        `id, name, phone, org_id, property_interest_id,
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

    // Batch: fetch latest conversation per eligible lead in one query
    const eligibleIds = eligibleLeads.map((l) => l.id)
    const { data: allConversations } = await supabase
      .from("conversations")
      .select("id, lead_id")
      .in("lead_id", eligibleIds)
      .order("last_message_at", { ascending: false })

    const latestConvByLead = new Map<string, string>()
    for (const conv of allConversations ?? []) {
      if (!latestConvByLead.has(conv.lead_id)) {
        latestConvByLead.set(conv.lead_id, conv.id)
      }
    }

    for (const lead of eligibleLeads) {
      processed++

      const conversationId = latestConvByLead.get(lead.id)

      if (!conversationId) continue

      // Get the last message from the conversation
      const { data: lastMessages } = await supabase
        .from("messages")
        .select("role, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10)

      if (!lastMessages || lastMessages.length === 0) continue

      const lastMessage = lastMessages[0]
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

        // Create follow_up_log entry
        await supabase.from("follow_up_log").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          rule_id: rule.id,
          type: "nicole_sent",
          status: "sent",
          scheduled_at: now.toISOString(),
          sent_at: now.toISOString(),
          message,
        })

        // Send the message via Telegram
        const sent = await sendFollowUpMessage(lead.phone, message)

        if (sent) {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_TELEGRAM_SENT",
            message: `Follow-up sent to lead ${lead.id} via Telegram`,
            metadata: { lead_id: lead.id, type: "nicole_sent", stage: stage.name },
            source: "api/cron/followup",
          })
        }

        // Save message to conversation history (regardless of Telegram send status)
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: message,
          metadata: { source: "followup_cron", rule_id: rule.id, telegram_sent: sent },
        })

        // Update conversation timestamp
        await supabase
          .from("conversations")
          .update({ last_message_at: now.toISOString() })
          .eq("id", conversationId)

        // Create activity log
        await supabase.from("activities").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          type: "followup_nicole_sent",
          description: `Nicole enviou follow-up automatico na etapa "${stage.name}"${sent ? " (Telegram)" : " (salvo, envio pendente)"}`,
          metadata: { rule_id: rule.id, stage_id: rule.stage_id, telegram_sent: sent },
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

      // Create follow_up_log entry
      await supabase.from("follow_up_log").insert({
        org_id: appt.org_id,
        lead_id: appt.lead_id,
        type: "post_visit",
        status: "sent",
        scheduled_at: now.toISOString(),
        sent_at: now.toISOString(),
        message,
      })

      // Send via Telegram
      const leadPhone = (leadData as { phone?: string }).phone || ""
      const postVisitTgSent = await sendFollowUpMessage(leadPhone, message)

      if (postVisitTgSent) {
        logEvent({
          level: "info",
          category: "cron",
          event_type: "FOLLOWUP_TELEGRAM_SENT",
          message: `Post-visit follow-up sent to lead ${appt.lead_id} via Telegram`,
          metadata: { lead_id: appt.lead_id, type: "post_visit", appointment_id: appt.id },
          source: "api/cron/followup",
        })
      }

      // Save to conversation history
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .eq("lead_id", appt.lead_id)
        .order("last_message_at", { ascending: false })
        .limit(1)

      if (conversations && conversations.length > 0) {
        const conversationId = conversations[0].id

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: message,
          metadata: { source: "post_visit_followup", appointment_id: appt.id, telegram_sent: postVisitTgSent },
        })

        await supabase
          .from("conversations")
          .update({ last_message_at: now.toISOString() })
          .eq("id", conversationId)
      }

      // Activity log
      await supabase.from("activities").insert({
        org_id: appt.org_id,
        lead_id: appt.lead_id,
        type: "followup_post_visit",
        description: `Nicole enviou follow-up pos-visita (interesse: ${interestLevel || "nao informado"})${postVisitTgSent ? " (Telegram)" : ""}`,
        metadata: { appointment_id: appt.id, telegram_sent: postVisitTgSent },
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
