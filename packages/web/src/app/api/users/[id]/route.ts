import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

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
  const publicUpdates: Record<string, unknown> = {}

  if (body.role && ["admin", "supervisor", "broker", "obras"].includes(body.role)) {
    publicUpdates.role = body.role
  }
  if (body.is_active !== undefined) {
    publicUpdates.is_active = body.is_active
  }
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    publicUpdates.name = body.name.trim()
  }
  if (typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    publicUpdates.email = body.email.trim()
  }

  const hasNewPassword =
    typeof body.new_password === "string" && body.new_password.length > 0
  const hasPublicUpdates = Object.keys(publicUpdates).length > 0

  if (!hasPublicUpdates && !hasNewPassword) {
    return NextResponse.json({ error: "No updates" }, { status: 400 })
  }

  if (hasNewPassword && (body.new_password as string).length < 8) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 8 caracteres." },
      { status: 422 }
    )
  }

  const needsAuthUpdate =
    hasNewPassword || typeof publicUpdates.email === "string"

  // Fetch target user's auth_id only when Auth-level update is needed,
  // scoped to same org to prevent cross-org access.
  let targetAuthId: string | undefined
  if (needsAuthUpdate) {
    const { data: targetUser, error: fetchError } = await supabase
      .from("users")
      .select("auth_id")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .single()

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
    }
    targetAuthId = targetUser.auth_id
  }

  if (hasPublicUpdates) {
    const { error } = await supabase
      .from("users")
      .update(publicUpdates)
      .eq("id", id)
      .eq("org_id", appUser.org_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (needsAuthUpdate && targetAuthId) {
    const authUpdates: { email?: string; password?: string; email_confirm?: boolean } = {}
    if (typeof publicUpdates.email === "string") {
      authUpdates.email = publicUpdates.email
      authUpdates.email_confirm = true
    }
    if (hasNewPassword) {
      authUpdates.password = body.new_password as string
    }

    const adminSupabase = createAdminClient()
    const { error: authError } = await adminSupabase.auth.admin.updateUserById(
      targetAuthId,
      authUpdates
    )
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data: { ok: true } })
}
