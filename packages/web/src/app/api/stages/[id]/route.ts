import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildUpdatePayload, softDelete } from "@web/lib/api-utils"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const body = await request.json()

  const allowedFields = ["name", "slug", "type", "position", "color", "is_default"]
  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  console.log("[PATCH /api/stages/:id]", { id, org_id: appUser.org_id, fields })

  const { data: stage, error } = await supabase
    .from("kanban_stages")
    .update(fields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error) {
    console.error("[PATCH /api/stages/:id] DB error:", JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!stage) {
    const { data: check } = await supabase
      .from("kanban_stages")
      .select("id, org_id, is_active")
      .eq("id", id)
      .maybeSingle()
    console.error("[PATCH /api/stages/:id] not found. Stage in DB:", JSON.stringify(check))
    return NextResponse.json({ error: "Stage not found" }, { status: 404 })
  }

  return NextResponse.json({ data: stage })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const result = await softDelete(supabase, "kanban_stages", id, appUser.org_id)
  if (result.error) return result.error

  return NextResponse.json({ data: { message: "Stage deleted" } })
}
