import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { metaFetch, MetaOAuthException, MetaPermissionError } from "@trifold/shared"

interface ActionCard {
  type: "pause_campaign" | "resume_campaign" | "set_daily_budget"
  entity_id: string
  entity_name?: string
  description?: string
  value?: number // centavos, only for set_daily_budget
}

// POST /api/agent/action/confirm
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Only admins can execute actions
  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  let body: { message_id: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if (!body.message_id) {
    return NextResponse.json({ error: "MISSING_MESSAGE_ID" }, { status: 400 })
  }

  // Load the message and verify it belongs to user's org
  const { data: message } = await supabase
    .from("agent_chat_messages")
    .select("id, session_id, action_card, action_status, agent_chat_sessions!inner(org_id)")
    .eq("id", body.message_id)
    .maybeSingle()

  if (!message) {
    return NextResponse.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 })
  }

  const session = message.agent_chat_sessions as unknown as { org_id: string }
  if (session.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  if (!message.action_card) {
    return NextResponse.json({ error: "NO_ACTION_CARD" }, { status: 400 })
  }

  if (message.action_status !== "pending") {
    return NextResponse.json({ error: "ACTION_ALREADY_RESOLVED", status: message.action_status }, { status: 409 })
  }

  const card = message.action_card as ActionCard

  // Validate action types
  const validTypes = ["pause_campaign", "resume_campaign", "set_daily_budget"]
  if (!validTypes.includes(card.type)) {
    return NextResponse.json({ error: "INVALID_ACTION_TYPE" }, { status: 400 })
  }

  // Verify campaign belongs to org (anti-IDOR)
  const { data: campaign } = await supabase
    .from("meta_campaigns")
    .select("id, meta_campaign_id, name, status, org_id")
    .eq("meta_campaign_id", card.entity_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 })
  }

  // Get active Meta token
  const { data: accounts } = await supabase
    .from("meta_ad_accounts")
    .select("access_token")
    .eq("org_id", appUser.org_id)
    .eq("status", "active")
    .limit(1)

  const token = accounts?.[0]?.access_token
  if (!token) {
    return NextResponse.json({ error: "NO_META_TOKEN" }, { status: 502 })
  }

  // Build Meta API payload
  type MetaBody = { status?: string; daily_budget?: number }
  let metaBody: MetaBody
  let actionLabel: string
  let prevValue: unknown

  switch (card.type) {
    case "pause_campaign":
      metaBody    = { status: "PAUSED" }
      actionLabel = "pause"
      prevValue   = campaign.status
      break
    case "resume_campaign":
      metaBody    = { status: "ACTIVE" }
      actionLabel = "resume"
      prevValue   = campaign.status
      break
    case "set_daily_budget":
      if (!card.value || card.value < 100) {
        return NextResponse.json({ error: "INVALID_BUDGET_VALUE" }, { status: 400 })
      }
      metaBody    = { daily_budget: card.value }
      actionLabel = "set_budget"
      prevValue   = null
      break
  }

  // Execute on Meta API
  try {
    await metaFetch(`/${card.entity_id}`, token, {
      method: "POST",
      body: metaBody,
    })
  } catch (err) {
    if (err instanceof MetaOAuthException) {
      return NextResponse.json({ error: "META_TOKEN_INVALID" }, { status: 502 })
    }
    if (err instanceof MetaPermissionError) {
      return NextResponse.json({ error: "META_PERMISSION_DENIED" }, { status: 502 })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: "META_API_ERROR", detail: msg }, { status: 502 })
  }

  const now = new Date().toISOString()

  // Update campaign status in DB if applicable
  if (card.type === "pause_campaign") {
    await supabase.from("meta_campaigns").update({ status: "PAUSED" }).eq("meta_campaign_id", card.entity_id).eq("org_id", appUser.org_id)
  } else if (card.type === "resume_campaign") {
    await supabase.from("meta_campaigns").update({ status: "ACTIVE" }).eq("meta_campaign_id", card.entity_id).eq("org_id", appUser.org_id)
  }

  // Log to meta_sync_log for audit
  await supabase.from("meta_sync_log").insert({
    org_id: appUser.org_id,
    sync_type: "campaign_action",
    started_at: now,
    finished_at: now,
    status: "success",
    executed_by: appUser.id,
    details: {
      action: actionLabel,
      campaign_id: card.entity_id,
      campaign_name: campaign.name,
      source: "agent_chat",
      message_id: message.id,
      old_value: prevValue,
      new_value: card.type === "set_daily_budget" ? card.value : metaBody.status,
    },
  })

  // Mark action as executed on the message
  await supabase
    .from("agent_chat_messages")
    .update({
      action_status: "executed",
      action_executed_at: now,
      action_executed_by: appUser.id,
    })
    .eq("id", message.id)

  return NextResponse.json({
    ok: true,
    action: actionLabel,
    campaign_id: card.entity_id,
    executed_at: now,
  })
}
