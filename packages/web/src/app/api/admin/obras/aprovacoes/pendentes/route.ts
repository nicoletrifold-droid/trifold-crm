import { NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"


export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.aprovar_uploads")) {
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
