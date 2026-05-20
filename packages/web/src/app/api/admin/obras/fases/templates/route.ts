import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const adminSupabase = createAdminClient()
  const { data: templates, error } = await adminSupabase
    .from("obra_fase_templates")
    .select("id, nome, etapa")
    .eq("org_id", appUser.org_id)
    .order("nome", { ascending: true })
    .order("etapa", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ templates: templates ?? [] })
}
