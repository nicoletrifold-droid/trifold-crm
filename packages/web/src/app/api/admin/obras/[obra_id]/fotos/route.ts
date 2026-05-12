import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { notifyClientes } from "@web/lib/notificacoes"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  // Verifica que a obra pertence à org do admin (isolamento de org explícito)
  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Body inválido (esperado multipart/form-data)" },
      { status: 400 }
    )
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Campo 'file' obrigatório" },
      { status: 400 }
    )
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Arquivo deve ser uma imagem (image/*)" },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Arquivo excede o tamanho máximo de 10 MB" },
      { status: 400 }
    )
  }

  const captionRaw = formData.get("caption")
  const caption =
    typeof captionRaw === "string" && captionRaw.trim().length > 0
      ? captionRaw.trim()
      : null

  const faseIdRaw = formData.get("fase_id")
  const faseId =
    typeof faseIdRaw === "string" && faseIdRaw.length > 0 ? faseIdRaw : null

  const takenAtRaw = formData.get("taken_at")
  const takenAt =
    typeof takenAtRaw === "string" && takenAtRaw.length > 0 ? takenAtRaw : null

  // Validação opcional: se fase_id fornecida, garantir que pertence à obra
  if (faseId) {
    const { data: fase } = await supabase
      .from("obra_fases")
      .select("id")
      .eq("id", faseId)
      .eq("obra_id", obra_id)
      .single()
    if (!fase) {
      return NextResponse.json(
        { error: "fase_id inválido para esta obra" },
        { status: 400 }
      )
    }
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext =
    file.name.includes(".") && file.name.split(".").pop()
      ? file.name.split(".").pop()!.toLowerCase()
      : "jpg"
  const storagePath = `obras/${obra_id}/fotos/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("obra-fotos")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: `Falha no upload: ${uploadError.message}` },
      { status: 500 }
    )
  }

  const { data: foto, error: insertError } = await supabase
    .from("obra_fotos")
    .insert({
      obra_id,
      org_id: appUser.org_id,
      uploaded_by: appUser.id,
      storage_path: storagePath,
      caption,
      fase_id: faseId,
      taken_at: takenAt,
    })
    .select("id, storage_path, caption, taken_at, fase_id")
    .single()

  if (insertError) {
    // Rollback: remover arquivo do storage se a inserção falhou
    await supabase.storage.from("obra-fotos").remove([storagePath])
    return NextResponse.json(
      { error: `Falha ao registrar foto: ${insertError.message}` },
      { status: 500 }
    )
  }

  // Fire-and-forget: notificar clientes vinculados
  notifyClientes(obra_id, "nova_foto", obra.name).catch(() => {})

  return NextResponse.json({ foto }, { status: 201 })
}
