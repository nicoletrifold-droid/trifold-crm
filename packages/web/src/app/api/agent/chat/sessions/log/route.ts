import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

// GET /api/agent/chat/sessions/log — audit log of all agent sessions in the org (admin/supervisor only)
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "agente.ver_log")
  if (roleError) return roleError

  const { searchParams } = request.nextUrl
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)

  const { data: sessions, error } = await supabase
    .from("agent_chat_sessions")
    .select("id, title, context_type, context_id, created_at, updated_at, users!user_id(name, role)")
    .eq("org_id", appUser.org_id)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sessions: sessions ?? [] })
}
