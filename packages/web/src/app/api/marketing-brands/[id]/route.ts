import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { BRAND_SELECT, validateBrandConsistency, validateMarketingBrandInput } from "@web/lib/marketing/brands"

// Story 75-229 — edição/remoção de marca (RLS sem policies → admin client + org_id).

// PATCH /api/marketing-brands/[id] — edição parcial dos dados da marca.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const { data: current } = await admin
    .from("marketing_brands")
    .select("id, tipo, property_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: "Marca não encontrada" }, { status: 404 })

  const parsed = validateMarketingBrandInput(await req.json().catch(() => null), {
    partial: true,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (Object.keys(parsed.value).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  // Consistência tipo×empreendimento avaliada sobre o estado FINAL (atual + patch).
  const finalTipo = parsed.value.tipo ?? (current.tipo as string)
  const finalProperty =
    parsed.value.property_id !== undefined
      ? parsed.value.property_id
      : (current.property_id as string | null)
  const consistency = validateBrandConsistency(finalTipo, finalProperty)
  if (consistency) return NextResponse.json({ error: consistency }, { status: 400 })

  const { data, error } = await admin
    .from("marketing_brands")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select(BRAND_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brand: data })
}

// DELETE /api/marketing-brands/[id] — remove a marca, os registros de assets
// (CASCADE) e os arquivos do Storage (limpeza manual — CASCADE não alcança o bucket).
export async function DELETE(
  _req: NextRequest,
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

  const { data: assets } = await admin
    .from("marketing_brand_assets")
    .select("file_path")
    .eq("brand_id", id)
    .eq("org_id", appUser.org_id)

  const paths = (assets ?? []).map((a) => a.file_path as string).filter(Boolean)
  if (paths.length > 0) {
    // Best-effort: falha no Storage não impede a exclusão lógica (arquivo órfão
    // é aceitável; o inverso — registro sem exclusão — confundiria a UI).
    const { error: storageError } = await admin.storage.from("marketing-brands").remove(paths)
    if (storageError) console.error("[marketing-brands] limpeza storage:", storageError.message)
  }

  const { error } = await admin
    .from("marketing_brands")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
