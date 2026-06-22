import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { ensureConversaAtribuida } from "@web/lib/portal/conversa"

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20 MB
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024 // 20 MB

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id } = await params

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file")
  const typeField = formData.get("type")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' é obrigatório" }, { status: 400 })
  }

  const isImage = file.type.startsWith("image/")
  const isAudio = file.type.startsWith("audio/")
  const isDocument = DOCUMENT_MIME_TYPES.has(file.type)

  let messageType: "image" | "audio" | "document"
  if (typeField === "audio" || (!typeField && isAudio)) {
    messageType = "audio"
  } else if (typeField === "document" || (!typeField && isDocument)) {
    messageType = "document"
  } else if (typeField === "image" || (!typeField && isImage)) {
    messageType = "image"
  } else {
    return NextResponse.json(
      { error: "Tipo inválido. Envie uma imagem, áudio ou documento." },
      { status: 400 }
    )
  }

  const maxBytes =
    messageType === "audio" || messageType === "document" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
  const maxLabel = messageType === "image" ? "10 MB" : "20 MB"

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máx. ${maxLabel})` },
      { status: 400 }
    )
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : ""
  const storagePath = `obra-mensagens/${obra_id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from("obra-mensagens")
    .upload(storagePath, Buffer.from(bytes), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: mensagem, error: dbError } = await supabase
    .from("obra_mensagens")
    .insert({
      obra_id,
      org_id: appUser.org_id,
      sender_id: appUser.id,
      sender_type: "cliente",
      cliente_id: appUser.id,
      content: messageType === "document" ? file.name : null,
      message_type: messageType,
      storage_path: storagePath,
    })
    .select("id, content, storage_path, message_type, created_at")
    .single()

  if (dbError) {
    await supabase.storage.from("obra-mensagens").remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Story 75-16: garante a conversa atribuída ao atendente padrão (roteamento).
  await ensureConversaAtribuida(createAdminClient(), {
    obraId: obra_id,
    orgId: appUser.org_id,
    clienteId: appUser.id,
  })

  return NextResponse.json({ mensagem }, { status: 201 })
}
