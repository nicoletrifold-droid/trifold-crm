import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

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
