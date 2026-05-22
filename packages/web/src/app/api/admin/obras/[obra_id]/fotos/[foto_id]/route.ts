import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getRequestIp, logAudit } from "@web/lib/audit"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ obra_id: string; foto_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, foto_id } = await params

  // Busca a foto restringindo por obra_id e org_id (isolamento explícito)
  const { data: foto } = await supabase
    .from("obra_fotos")
    .select("id, caption, storage_path")
    .eq("id", foto_id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!foto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Remove do Storage — idempotente; se o arquivo não existe, ignora
  await supabase.storage.from("obra-fotos").remove([foto.storage_path])

  const { error: deleteError } = await supabase
    .from("obra_fotos")
    .delete()
    .eq("id", foto_id)

  if (deleteError) {
    return NextResponse.json(
      { error: `Falha ao remover foto: ${deleteError.message}` },
      { status: 500 }
    )
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "foto.delete",
    entity_type: "foto",
    entity_id: foto.id,
    entity_name: foto.caption ?? undefined,
    obra_id,
    metadata: { storage_path: foto.storage_path },
    ip_address: getRequestIp(req.headers),
  })

  return new NextResponse(null, { status: 204 })
}
