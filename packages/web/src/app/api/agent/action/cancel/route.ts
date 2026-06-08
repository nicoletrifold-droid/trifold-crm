import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

// POST /api/agent/action/cancel
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  let body: { message_id: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if (!body.message_id) {
    return NextResponse.json({ error: "MISSING_MESSAGE_ID" }, { status: 400 })
  }

  // Verify message belongs to user's org
  const { data: message } = await supabase
    .from("agent_chat_messages")
    .select("id, action_status, agent_chat_sessions!inner(org_id)")
    .eq("id", body.message_id)
    .maybeSingle()

  if (!message) {
    return NextResponse.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 })
  }

  const session = message.agent_chat_sessions as unknown as { org_id: string }
  if (session.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  if (message.action_status !== "pending") {
    return NextResponse.json({ error: "ACTION_ALREADY_RESOLVED", status: message.action_status }, { status: 409 })
  }

  await supabase
    .from("agent_chat_messages")
    .update({ action_status: "cancelled" })
    .eq("id", body.message_id)

  return NextResponse.json({ ok: true })
}
