import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]
const ALLOWED_STATUS = ["pendente", "em_andamento", "concluida"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; fase_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, fase_id } = await params

  const { data: fase } = await supabase
    .from("obra_fases")
    .select("id, obra_id")
    .eq("id", fase_id)
    .eq("obra_id", obra_id)
    .single()

  if (!fase) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
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
  if (ALLOWED_STATUS.includes(body.status)) {
    updates.status = body.status
  }
  if (
    typeof body.progress_pct === "number" &&
    body.progress_pct >= 0 &&
    body.progress_pct <= 100
  ) {
    updates.progress_pct = body.progress_pct
  }
  if ("start_date" in body) updates.start_date = body.start_date ?? null
  if ("end_date" in body) updates.end_date = body.end_date ?? null
  if ("expected_start_date" in body) {
    updates.expected_start_date = body.expected_start_date ?? null
  }
  if ("expected_end_date" in body) {
    updates.expected_end_date = body.expected_end_date ?? null
  }

  const { data: updated, error } = await supabase
    .from("obra_fases")
    .update(updates)
    .eq("id", fase_id)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ fase: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string; fase_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, fase_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("obra_fases")
    .delete()
    .eq("id", fase_id)
    .eq("obra_id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
