import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getRequestIp, logAudit } from "@web/lib/audit"
import { notifyClientes } from "@web/lib/notificacoes"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const VALID_CATEGORIES = ["ART/RRT", "Contratos", "Memoriais", "Outros"]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: documentos, error } = await supabase
    .from("obra_documentos")
    .select("id, name, filename, category, file_size_bytes, created_at")
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documentos: documentos ?? [] })
}

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
    .select("id, name")
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
  const name = formData.get("name")
  const categoryRaw = formData.get("category")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' é obrigatório" }, { status: 400 })
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Campo 'name' é obrigatório" }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Arquivo muito grande (máx. 50 MB)" },
      { status: 400 }
    )
  }

  const category =
    typeof categoryRaw === "string" && VALID_CATEGORIES.includes(categoryRaw)
      ? categoryRaw
      : "Outros"

  const ext = file.name.includes(".") ? file.name.split(".").pop() : ""
  const filename = file.name
  const storagePath = `obra-docs/${obra_id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from("obra-docs")
    .upload(storagePath, Buffer.from(bytes), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: documento, error: dbError } = await supabase
    .from("obra_documentos")
    .insert({
      obra_id,
      org_id: appUser.org_id,
      uploaded_by: appUser.id,
      name: name.trim(),
      filename,
      storage_path: storagePath,
      category,
      file_size_bytes: file.size,
    })
    .select("id, name, category, filename, file_size_bytes, created_at")
    .single()

  if (dbError) {
    await supabase.storage.from("obra-docs").remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Fire-and-forget: notificar clientes vinculados
  notifyClientes(obra_id, "novo_documento", obra.name).catch(() => {})

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "documento.upload",
    entity_type: "documento",
    entity_id: documento.id,
    entity_name: documento.name,
    obra_id,
    metadata: {
      filename: documento.filename,
      file_size_bytes: documento.file_size_bytes,
    },
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ documento }, { status: 201 })
}
