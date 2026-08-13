import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import crypto from "crypto"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const propertyId = request.nextUrl.searchParams.get("property_id")
  const category = request.nextUrl.searchParams.get("category")

  let query = supabase
    .from("agent_media_assets")
    .select(`
      id, title, category, file_url, file_name, file_type, file_size, is_active, created_at,
      property_id,
      property:properties(name)
    `)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (propertyId) query = query.eq("property_id", propertyId)
  if (category) query = query.eq("category", category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const mapped = (data ?? []).map((a) => ({
    ...a,
    property_name: (a.property as { name?: string } | null)?.name ?? null,
    property: undefined,
  }))

  return NextResponse.json({ data: mapped })
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
])
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
}


export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "nicole.midia_gerenciar")
  if (forbidden) return forbidden

  const formData = await request.formData()
  const file = formData.get("file")
  const title = (formData.get("title") as string | null)?.trim()
  const propertyId = (formData.get("property_id") as string | null) || null
  const category = (formData.get("category") as string | null) || "outro"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' obrigatório." }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: "Campo 'title' obrigatório." }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo não suportado. Use JPEG, PNG, WebP ou PDF." },
      { status: 422 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo excede 20 MB." }, { status: 422 })
  }
  if (!["planta", "fachada", "tabela", "outro"].includes(category)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 422 })
  }

  const fileType = file.type === "application/pdf" ? "pdf" : "image"
  const ext = EXT[file.type] ?? "bin"
  const assetId = crypto.randomUUID()
  const storagePath = `${appUser.org_id}/${assetId}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("nicole-media")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from("nicole-media")
    .getPublicUrl(storagePath)

  const { data: asset, error: dbError } = await supabase
    .from("agent_media_assets")
    .insert({
      org_id: appUser.org_id,
      property_id: propertyId,
      title,
      category,
      file_path: storagePath,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: fileType,
      file_size: file.size,
      created_by: appUser.id,
    })
    .select("id")
    .single()

  if (dbError) {
    // Rollback storage upload
    await supabase.storage.from("nicole-media").remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ id: asset.id, url: urlData.publicUrl }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "nicole.midia_gerenciar")
  if (forbidden) return forbidden

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body inválido." }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.title === "string") update.title = body.title.trim()
  if (typeof body.category === "string") update.category = body.category
  if (typeof body.property_id !== "undefined") update.property_id = body.property_id || null
  if (typeof body.is_active === "boolean") update.is_active = body.is_active

  const { error } = await supabase
    .from("agent_media_assets")
    .update(update)
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "nicole.midia_gerenciar")
  if (forbidden) return forbidden

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 })

  const { data: asset, error: fetchError } = await supabase
    .from("agent_media_assets")
    .select("file_path")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 })
  }

  await supabase.storage.from("nicole-media").remove([asset.file_path])

  const { error } = await supabase
    .from("agent_media_assets")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
