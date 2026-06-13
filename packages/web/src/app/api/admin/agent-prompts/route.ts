import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

/**
 * GET /api/admin/agent-prompts
 * Lista todos os prompts da Nicole (agent_prompts) da org autenticada.
 * Admin-only (Story 53-2).
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const { data: prompts, error } = await supabase
    .from("agent_prompts")
    .select("id, slug, name, type, content, is_active")
    .eq("org_id", appUser.org_id)
    .order("slug")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: prompts ?? [] })
}
