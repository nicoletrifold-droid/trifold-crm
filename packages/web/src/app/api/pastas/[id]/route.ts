import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canManagePastas } from "@web/lib/pastas/roles"

// DELETE /api/pastas/[id] — exclui a pasta (admin/supervisor/gerente-comercial/imob).
// Remove os arquivos do bucket privado (`pastas/{id}/…`) e a linha (cascade nos docs).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canManagePastas(appUser.id, appUser.org_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  // Confirma que a pasta é da org do usuário (RLS org-scoped reforça).
  const { data: pasta } = await supabase
    .from("pastas")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!pasta) {
    return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 })
  }

  const admin = createAdminClient()

  // Remove os arquivos do bucket privado (pasta = "folder" {id}).
  const { data: files } = await admin.storage.from("pastas").list(id)
  if (files?.length) {
    await admin.storage.from("pastas").remove(files.map((f) => `${id}/${f.name}`))
  }

  const { error } = await supabase
    .from("pastas")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
