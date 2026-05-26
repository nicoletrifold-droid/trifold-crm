import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Body inválido (esperado multipart/form-data)" },
      { status: 400 }
    )
  }

  const description =
    typeof formData.get("description") === "string"
      ? (formData.get("description") as string).trim()
      : ""
  const reason =
    typeof formData.get("reason") === "string"
      ? (formData.get("reason") as string).trim()
      : ""

  if (description.length < 20) {
    return NextResponse.json(
      { error: "Descrição deve ter pelo menos 20 caracteres" },
      { status: 400 }
    )
  }

  if (reason.length < 10) {
    return NextResponse.json(
      { error: "Motivo deve ter pelo menos 10 caracteres" },
      { status: 400 }
    )
  }

  // --- Upload de imagem (opcional) ---
  let imageUrl: string | null = null
  const file = formData.get("image")

  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: "Imagem deve ser JPEG, PNG, WEBP ou GIF" },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Imagem excede o limite de 5 MB" },
        { status: 400 }
      )
    }

    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : "jpg"
    const storagePath = `${appUser.org_id}/${appUser.id}/${crypto.randomUUID()}.${ext}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: uploadError } = await supabase.storage
      .from("chamados-attachments")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      return NextResponse.json(
        { error: `Falha no upload: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: publicUrlData } = supabase.storage
      .from("chamados-attachments")
      .getPublicUrl(storagePath)

    imageUrl = publicUrlData.publicUrl
  }

  // --- Inserir chamado ---
  const { data: chamado, error: insertError } = await supabase
    .from("chamados")
    .insert({
      org_id: appUser.org_id,
      reporter_id: appUser.id,
      reporter_name: appUser.name,
      description,
      reason,
      image_url: imageUrl,
      status: "aberto",
    })
    .select("id, description, reason, image_url, status, created_at")
    .single()

  if (insertError) {
    // Rollback: remover imagem do storage se inserção falhou
    if (imageUrl) {
      const path = imageUrl.split("/").slice(-3).join("/")
      await supabase.storage.from("chamados-attachments").remove([path])
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ chamado }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")

  const isAdmin =
    appUser.role === "admin" || appUser.role === "supervisor"

  let query = supabase
    .from("chamados")
    .select(
      "id, description, reason, image_url, status, reporter_name, created_at"
    )
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  // Non-admin: apenas os seus próprios (RLS já garante, mas filtramos explicitamente)
  if (!isAdmin) {
    query = query.eq("reporter_id", appUser.id)
  }

  if (status && status !== "todos") {
    query = query.eq("status", status)
  }

  const { data: chamados, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ chamados: chamados ?? [], isAdmin })
}
