import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"

// Story 75-229 — exclusão de arquivo do Kit de Marcas (linha + objeto do Storage).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id, assetId } = await params

  const { data: asset } = await admin
    .from("marketing_brand_assets")
    .select("id, file_path")
    .eq("id", assetId)
    .eq("brand_id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })

  const { error } = await admin
    .from("marketing_brand_assets")
    .delete()
    .eq("id", assetId)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort: linha já saiu; arquivo órfão no bucket é aceitável (logado).
  const { error: storageError } = await admin.storage
    .from("marketing-brands")
    .remove([asset.file_path as string])
  if (storageError) console.error("[marketing-brands] remove storage:", storageError.message)

  return NextResponse.json({ ok: true })
}
