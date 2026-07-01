import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

// Público (sem login) — o interessado envia um documento pelo link (token). Valida o
// token, sobe pro bucket PRIVADO `pastas` via service role e marca o doc como entregue.
const MAX_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "heic"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: pasta } = await admin
    .from("pastas")
    .select("id")
    .eq("token", token)
    .maybeSingle()

  if (!pasta) {
    return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 })
  }

  const form = await request.formData().catch(() => null)
  const docId = form?.get("docId")
  const file = form?.get("file")

  if (typeof docId !== "string" || !(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo excede 25 MB" }, { status: 413 })
  }

  // O documento tem que pertencer a ESTA pasta (o token não dá acesso a outras).
  const { data: doc } = await admin
    .from("pasta_documentos")
    .select("id, slug, storage_path")
    .eq("id", docId)
    .eq("pasta_id", pasta.id)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: "Documento não pertence a esta pasta" }, { status: 400 })
  }

  const fileName = (file as File).name ?? `${doc.slug}`
  const ext = (fileName.split(".").pop() ?? "").toLowerCase()
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json(
      { error: "Formato não permitido. Envie PDF ou imagem." },
      { status: 415 }
    )
  }

  const storagePath = `${pasta.id}/${doc.slug}-${Date.now()}.${ext}`
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

  // Remove o arquivo anterior (se reenvio) e atualiza o registro.
  if (doc.storage_path && doc.storage_path !== storagePath) {
    await admin.storage.from("pastas").remove([doc.storage_path])
  }

  const { error: updErr } = await admin
    .from("pasta_documentos")
    .update({
      storage_path: storagePath,
      filename: fileName,
      file_size_bytes: file.size,
      uploaded_at: new Date().toISOString(),
      situacao: "entregue",
    })
    .eq("id", doc.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
