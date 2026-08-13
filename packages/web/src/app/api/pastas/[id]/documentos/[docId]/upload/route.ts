import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canManagePastas } from "@web/lib/pastas/roles"

// POST — upload INTERNO pelo gestor (não pelo link do interessado). Mesma mecânica do
// upload público, mas autenticado e gated. Serve pra cadastrar/corrigir documentos.
const MAX_SIZE_BYTES = 25 * 1024 * 1024
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "heic"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canManagePastas(appUser.id, appUser.org_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, docId } = await params

  // Confirma que o doc pertence a uma pasta da org do usuário.
  const { data: doc } = await supabase
    .from("pasta_documentos")
    .select("id, slug, storage_path, pasta:pastas!inner(id, org_id)")
    .eq("id", docId)
    .eq("pasta_id", id)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo excede 25 MB" }, { status: 413 })
  }

  const fileName = (file as File).name ?? doc.slug
  const ext = (fileName.split(".").pop() ?? "").toLowerCase()
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: "Formato não permitido. Envie PDF ou imagem." }, { status: 415 })
  }

  const admin = createAdminClient()
  const storagePath = `${id}/${doc.slug}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from("pastas")
    .upload(storagePath, buffer, {
      contentType: (file as File).type || "application/octet-stream",
      upsert: true,
    })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  if (doc.storage_path && doc.storage_path !== storagePath) {
    await admin.storage.from("pastas").remove([doc.storage_path])
  }

  const { error: updErr } = await supabase
    .from("pasta_documentos")
    .update({
      storage_path: storagePath,
      filename: fileName,
      file_size_bytes: file.size,
      uploaded_at: new Date().toISOString(),
      situacao: "entregue",
    })
    .eq("id", doc.id)
    .eq("pasta_id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
