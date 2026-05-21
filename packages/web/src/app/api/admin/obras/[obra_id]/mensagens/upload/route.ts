import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { notifyClientes } from "@web/lib/notificacoes"

const ALLOWED_ROLES = ["admin", "supervisor", "broker"]

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
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

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name, org_id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file")
  const clienteId =
    typeof formData.get("cliente_id") === "string"
      ? (formData.get("cliente_id") as string).trim()
      : null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' é obrigatório" }, { status: 400 })
  }

  if (!clienteId) {
    return NextResponse.json({ error: "cliente_id é obrigatório" }, { status: 400 })
  }

  const isImage = file.type.startsWith("image/")
  const isDocument = DOCUMENT_MIME_TYPES.has(file.type)

  let messageType: "image" | "document"
  if (isDocument) {
    messageType = "document"
  } else if (isImage) {
    messageType = "image"
  } else {
    return NextResponse.json(
      { error: "Tipo inválido. Envie uma imagem ou documento." },
      { status: 400 }
    )
  }

  const maxBytes = messageType === "document" ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES
  const maxLabel = messageType === "document" ? "20 MB" : "10 MB"

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máx. ${maxLabel})` },
      { status: 400 }
    )
  }

  // Validate cliente belongs to org
  const { data: clienteUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", clienteId)
    .eq("org_id", obra.org_id)
    .single()

  if (!clienteUser) {
    return NextResponse.json(
      { error: "Cliente não encontrado nesta organização" },
      { status: 400 }
    )
  }

  // Defensive upsert — restores portal access if link was lost
  await supabase
    .from("cliente_obras")
    .upsert(
      { user_id: clienteId, obra_id, is_primary: true },
      { onConflict: "user_id,obra_id", ignoreDuplicates: true }
    )

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
      org_id: obra.org_id,
      sender_id: appUser.id,
      sender_type: "equipe",
      sender_display_name: appUser.name,
      cliente_id: clienteId,
      content: messageType === "document" ? file.name : null,
      message_type: messageType,
      storage_path: storagePath,
    })
    .select("id, content, storage_path, message_type, created_at, sender_type, sender_display_name, cliente_id")
    .single()

  if (dbError) {
    await supabase.storage.from("obra-mensagens").remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  notifyClientes(obra_id, "nova_mensagem", obra.name).catch(() => {})

  return NextResponse.json({ mensagem }, { status: 201 })
}
