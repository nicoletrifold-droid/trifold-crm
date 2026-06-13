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

  // admin/supervisor/gerente-comercial podem editar — mas website só admin
  const roleError = requireRole(appUser, ["admin", "supervisor", "gerente-comercial"])
  if (roleError) return roleError

  // Fetch current entry to check source
  const { data: current } = await supabase
    .from("knowledge_base")
    .select("source")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!current) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  }

  // Entradas de website: somente admin pode editar
  if (current.source === "website" && appUser.role !== "admin") {
    return NextResponse.json(
      { error: "Entradas de website só podem ser editadas por admin." },
      { status: 403 }
    )
  }

  const body = await request.json()

  const { fields: updateFields, error: payloadError } = buildUpdatePayload(body, [
    "title",
    "content",
    "source",
    "source_id",
    "metadata",
  ])

  if (payloadError) return payloadError

  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .update(updateFields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  }

  return NextResponse.json({ data: entry })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser, supabase } = auth

  // Exclusão: somente admin
  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const result = await softDelete(supabase, "knowledge_base", id, appUser.org_id)
  if (result.error) return result.error

  return NextResponse.json({ data: { message: "Entry deleted" } })
}
