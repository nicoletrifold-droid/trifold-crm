import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

const MAX_SIZE_BYTES = 25 * 1024 * 1024

// GET (listar) / POST (upload multipart) anexos de um cartão. Story Lançamentos-05.
// Bucket privado "lancamentos"; download via rota signed-url. Mesma mecânica do módulo Pastas.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("lancamento_card_attachments")
    .select("id, file_name, file_size_bytes, mime, created_at")
    .eq("card_id", id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attachments: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data: card } = await admin
    .from("lancamento_cards").select("id").eq("id", id).eq("org_id", appUser.org_id).maybeSingle()
  if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo excede 25 MB" }, { status: 413 })
  }

  const fileName = (file as File).name ?? "arquivo"
  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase()
  const storagePath = `${id}/${Date.now()}-${Math.round(file.size)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from("lancamentos")
    .upload(storagePath, buffer, { contentType: (file as File).type || "application/octet-stream", upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error } = await admin
    .from("lancamento_card_attachments")
    .insert({
      org_id: appUser.org_id, card_id: id, file_name: fileName, storage_path: storagePath,
      file_size_bytes: file.size, mime: (file as File).type || null, uploaded_by: appUser.id,
    })
    .select("id, file_name, file_size_bytes, mime, created_at")
    .single()
  if (error) {
    await admin.storage.from("lancamentos").remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ attachment: data })
}
