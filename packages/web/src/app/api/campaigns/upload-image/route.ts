import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import crypto from "crypto"

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const campaignId = request.nextUrl.searchParams.get("campaign_id")
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id query param required" }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 })
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo de arquivo não suportado. Use JPEG, PNG, WebP ou GIF." },
      { status: 422 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo excede o limite de 5 MB." },
      { status: 422 }
    )
  }

  const ext = EXT[file.type] ?? "jpg"
  const variantId = crypto.randomUUID()
  const storagePath = `${appUser.org_id}/${campaignId}/${variantId}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("campaign-assets")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from("campaign-assets")
    .getPublicUrl(storagePath)

  return NextResponse.json({ url: urlData.publicUrl, variant_id: variantId }, { status: 201 })
}
