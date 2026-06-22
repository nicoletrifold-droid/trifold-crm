import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { logAudit, getRequestIp } from "@web/lib/audit"

/**
 * Story 75-14 — Perfil "obras" solicita exclusão de uma foto com MOTIVO.
 * Cria um pedido na fila de aprovação (obra_upload_aprovacoes, tipo
 * 'exclusao_foto') para o supervisor aprovar. Admin/supervisor excluem direto
 * (DELETE), sem passar por aqui.
 *
 * POST /api/admin/obras/[obra_id]/fotos/[foto_id]/solicitar-exclusao  { motivo }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; foto_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (appUser.role !== "obras") {
    return NextResponse.json(
      { error: "Apenas o perfil obras solicita exclusão; admin/supervisor excluem direto." },
      { status: 403 }
    )
  }

  const { obra_id, foto_id } = await params

  const body = await req.json().catch(() => ({}))
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : ""
  if (!motivo) {
    return NextResponse.json({ error: "Descreva o motivo da exclusão." }, { status: 400 })
  }

  // Foto precisa existir na obra/org
  const { data: foto } = await supabase
    .from("obra_fotos")
    .select("id, caption, storage_path")
    .eq("id", foto_id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!foto) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 })
  }

  // Evita pedido duplicado pendente para a mesma foto
  const { data: existing } = await supabase
    .from("obra_upload_aprovacoes")
    .select("id")
    .eq("obra_id", obra_id)
    .eq("tipo", "exclusao_foto")
    .eq("status", "pendente")
    .filter("metadata->>foto_id", "eq", foto_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "Já existe um pedido de exclusão pendente para esta foto." },
      { status: 409 }
    )
  }

  const { data: pedido, error } = await supabase
    .from("obra_upload_aprovacoes")
    .insert({
      org_id: appUser.org_id,
      obra_id,
      tipo: "exclusao_foto",
      storage_path: foto.storage_path,
      storage_bucket: "obra-fotos",
      metadata: {
        foto_id: foto.id,
        caption: foto.caption,
        motivo,
      },
      enviado_por: appUser.id,
    })
    .select("id, status")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "foto.exclusao_solicitada",
    entity_type: "foto",
    entity_id: foto.id,
    entity_name: foto.caption ?? undefined,
    obra_id,
    metadata: { motivo },
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ pedido }, { status: 201 })
}
