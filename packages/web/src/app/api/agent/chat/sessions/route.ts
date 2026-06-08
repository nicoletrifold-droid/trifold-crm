import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

// GET /api/agent/chat/sessions — list sessions for current user (newest first)
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { searchParams } = request.nextUrl
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "30"), 50)
  const cursor = searchParams.get("cursor") // updated_at ISO for pagination

  let query = supabase
    .from("agent_chat_sessions")
    .select("id, title, context_type, context_id, created_at, updated_at")
    .eq("org_id", appUser.org_id)
    .eq("user_id", appUser.id)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt("updated_at", cursor)
  }

  const { data: sessions, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const nextCursor = sessions && sessions.length === limit
    ? sessions[sessions.length - 1]!.updated_at
    : null

  return NextResponse.json({ sessions: sessions ?? [], next_cursor: nextCursor })
}
