import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "broker", "obras"]

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { data: roles, error } = await supabase
    .from("roles")
    .select("id, name, label, color, is_system")
    .eq("org_id", appUser.org_id)
    .order("label")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ roles: roles ?? [] })
}
