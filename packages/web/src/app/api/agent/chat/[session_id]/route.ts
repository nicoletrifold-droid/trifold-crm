import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

// GET /api/agent/chat/[session_id] — load session + messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ session_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { session_id } = await params

  const { data: session } = await supabase
    .from("agent_chat_sessions")
    .select("id, title, context_type, context_id, created_at, updated_at")
    .eq("id", session_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 })
  }

  const { data: messages } = await supabase
    .from("agent_chat_messages")
    .select("id, role, content, action_card, action_status, action_executed_at, action_executed_by, created_at")
    .eq("session_id", session_id)
    .order("created_at", { ascending: true })

  return NextResponse.json({ session, messages: messages ?? [] })
}
