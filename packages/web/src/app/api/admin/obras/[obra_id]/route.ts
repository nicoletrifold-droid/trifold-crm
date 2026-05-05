import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date"
    )
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const [fasesRes, fotosRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select("id, name, status, order_index")
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_fotos")
      .select("id, storage_path, caption, taken_at, fase_id, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false }),
  ])

  return NextResponse.json({
    obra,
    fases: fasesRes.data ?? [],
    fotos: fotosRes.data ?? [],
  })
}
