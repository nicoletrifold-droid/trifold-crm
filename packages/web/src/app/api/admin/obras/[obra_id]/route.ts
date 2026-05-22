import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]
const ADMIN_ONLY = ["admin"]

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
    .is("deleted_at", null)
    .maybeSingle()

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: existing } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim()
  }
  if ("description" in body) {
    updates.description = body.description ?? null
  }
  if (["em_andamento", "concluida", "pausada"].includes(body.status)) {
    updates.status = body.status
  }
  if ("expected_delivery_date" in body) {
    updates.expected_delivery_date = body.expected_delivery_date ?? null
  }
  if (typeof body.progress_pct === "number") {
    updates.progress_pct = Math.max(0, Math.min(100, Math.round(body.progress_pct)))
  }

  const { data: obra, error } = await supabase
    .from("obras")
    .update(updates)
    .eq("id", obra_id)
    .select("id, name, status, progress_pct, expected_delivery_date")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ obra })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ADMIN_ONLY.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: existing } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("obras")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
