import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { isValidBrandAssetTipo } from "@web/lib/marketing/brands"

// Story 75-229 — registro do arquivo do Kit de Marcas (passo 3 do fluxo signed:
// sign → uploadToSignedUrl → ESTE registro em JSON).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const { data: brand } = await admin
    .from("marketing_brands")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!brand) return NextResponse.json({ error: "Marca não encontrada" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as {
    tipo?: string
    label?: string
    storage_path?: string
    file_name?: string
    file_size?: number
  } | null

  if (!body || !isValidBrandAssetTipo(body.tipo)) {
    return NextResponse.json({ error: "tipo deve ser logo, foto ou elemento" }, { status: 400 })
  }
  const storagePath = typeof body.storage_path === "string" ? body.storage_path : ""
  // O path assinado nasce na rota /sign com prefixo {org_id}/{brand_id}/ — recusar
  // qualquer outro impede registrar arquivo de outra org/marca.
  if (!storagePath.startsWith(`${appUser.org_id}/${id}/`) || storagePath.includes("..")) {
    return NextResponse.json({ error: "storage_path inválido" }, { status: 400 })
  }
  const fileName = typeof body.file_name === "string" && body.file_name.trim() ? body.file_name.trim() : "arquivo"

  const { data: pub } = admin.storage.from("marketing-brands").getPublicUrl(storagePath)

  const { data, error } = await admin
    .from("marketing_brand_assets")
    .insert({
      org_id: appUser.org_id,
      brand_id: id,
      tipo: body.tipo,
      label: typeof body.label === "string" ? body.label.trim() || null : null,
      file_path: storagePath,
      file_url: pub.publicUrl,
      file_name: fileName,
      file_size: Number.isFinite(Number(body.file_size)) ? Number(body.file_size) : null,
      created_by: appUser.id,
    })
    .select("id, tipo, label, file_path, file_url, file_name, file_size, created_at")
    .single()

  if (error) {
    // Rollback do Storage: registro falhou → não deixar arquivo órfão.
    await admin.storage.from("marketing-brands").remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ asset: data }, { status: 201 })
}
