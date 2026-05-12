import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; doc_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, doc_id } = await params

  const { data: documento } = await supabase
    .from("obra_documentos")
    .select("id, storage_path")
    .eq("id", doc_id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!documento) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Remove do Storage (idempotente — ignora erro se arquivo não existir)
  await supabase.storage.from("obra-docs").remove([documento.storage_path])

  const { error: dbError } = await supabase
    .from("obra_documentos")
    .delete()
    .eq("id", doc_id)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
