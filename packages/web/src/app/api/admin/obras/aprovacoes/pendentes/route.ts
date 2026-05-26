import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { count, error } = await supabase
    .from("obra_upload_aprovacoes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", appUser.org_id)
    .eq("status", "pendente")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ total: count ?? 0 })
}
