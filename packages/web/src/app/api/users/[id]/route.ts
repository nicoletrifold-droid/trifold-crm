import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

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
  const updates: Record<string, unknown> = {}

  if (body.role && ["admin", "supervisor", "broker", "obras"].includes(body.role)) {
    updates.role = body.role
  }
  if (body.is_active !== undefined) {
    updates.is_active = body.is_active
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 })
  }

  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ok: true } })
}
