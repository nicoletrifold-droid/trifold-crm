import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

/**
 * GET /api/organization
 * Returns organization data for the current user's org.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, slug, settings, created_at")
    .eq("id", appUser.org_id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: org })
}

/**
 * PATCH /api/organization
 * Updates org name and settings. Admin only.
 *
 * Body: { name?: string, settings?: Record<string, unknown> }
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "configuracoes.empresa_editar")
  if (roleError) return roleError

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) {
    updates.name = body.name
  }

  if (body.settings !== undefined) {
    // Merge with existing settings
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", appUser.org_id)
      .single()

    const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
    updates.settings = { ...currentSettings, ...body.settings }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", appUser.org_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
