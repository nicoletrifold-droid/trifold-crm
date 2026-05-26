import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { obra_id } = await params

  const { data: obra, error } = await supabase
    .from("obras")
    .select(
      "id, sienge_enterprise_id, sienge_enterprise_name, sienge_sync_status, sienge_last_synced_at"
    )
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  return NextResponse.json({
    sienge_enterprise_id:
      (obra as { sienge_enterprise_id?: number | null }).sienge_enterprise_id ?? null,
    sienge_enterprise_name:
      (obra as { sienge_enterprise_name?: string | null }).sienge_enterprise_name ?? null,
    sienge_sync_status:
      (obra as { sienge_sync_status?: string | null }).sienge_sync_status ?? "never",
    sienge_last_synced_at:
      (obra as { sienge_last_synced_at?: string | null }).sienge_last_synced_at ?? null,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { obra_id } = await params

  let body: {
    sienge_enterprise_id?: number | null
    sienge_enterprise_name?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  // Valida obra pertence à org
  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.sienge_enterprise_id === null) {
    updates.sienge_enterprise_id = null
    updates.sienge_enterprise_name = null
    updates.sienge_sync_status = "never"
    updates.sienge_last_synced_at = null
  } else if (typeof body.sienge_enterprise_id === "number") {
    updates.sienge_enterprise_id = body.sienge_enterprise_id
    updates.sienge_enterprise_name =
      typeof body.sienge_enterprise_name === "string"
        ? body.sienge_enterprise_name
        : null
  } else {
    return NextResponse.json(
      { error: "sienge_enterprise_id deve ser número ou null" },
      { status: 400 }
    )
  }

  const { error: updateErr } = await supabase
    .from("obras")
    .update(updates)
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
