import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getRequestIp, logAudit } from "@web/lib/audit"

const ALLOWED_ROLES = ["admin", "supervisor", "obras", "gerente-relacionamento"]

/**
 * Story 75-13 — Editar foto (legenda + fase). Livre para admin/supervisor/obras,
 * sem aprovação. Aceita `caption` (string|null) e `fase_id` (uuid|null).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; foto_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, foto_id } = await params

  const { data: foto } = await supabase
    .from("obra_fotos")
    .select("id")
    .eq("id", foto_id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!foto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  if ("caption" in body) {
    updates.caption =
      typeof body.caption === "string" && body.caption.trim()
        ? body.caption.trim()
        : null
  }
  if ("fase_id" in body) {
    const faseId = typeof body.fase_id === "string" && body.fase_id ? body.fase_id : null
    // Valida que a fase pertence à obra (quando informada)
    if (faseId) {
      const { data: fase } = await supabase
        .from("obra_fases")
        .select("id")
        .eq("id", faseId)
        .eq("obra_id", obra_id)
        .maybeSingle()
      if (!fase) {
        return NextResponse.json({ error: "Fase inválida para esta obra" }, { status: 400 })
      }
    }
    updates.fase_id = faseId
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from("obra_fotos")
    .update(updates)
    .eq("id", foto_id)
    .select("id, caption, fase_id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "foto.update",
    entity_type: "foto",
    entity_id: foto_id,
    obra_id,
    metadata: updates,
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ foto: updated })
}

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
