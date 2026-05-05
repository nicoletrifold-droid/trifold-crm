import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20 MB

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

  // Determina o tipo a partir do MIME ou do campo explícito
  let messageType: "image" | "audio"
  if (typeField === "audio" || (!typeField && isAudio)) {
    messageType = "audio"
  } else if (typeField === "image" || (!typeField && isImage)) {
    messageType = "image"
  } else {
    return NextResponse.json(
      { error: "Tipo inválido. Envie uma imagem ou áudio." },
      { status: 400 }
    )
  }

  const maxBytes = messageType === "audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
  const maxLabel = messageType === "audio" ? "20 MB" : "10 MB"

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
      content: null,
      message_type: messageType,
      storage_path: storagePath,
    })
    .select("id, storage_path, message_type, created_at")
    .single()

  if (dbError) {
    await supabase.storage.from("obra-mensagens").remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ mensagem }, { status: 201 })
}
