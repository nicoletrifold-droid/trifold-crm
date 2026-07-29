import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { BRAND_SELECT, validateBrandConsistency, validateMarketingBrandInput } from "@web/lib/marketing/brands"

// Story 75-229 — Kit de Marcas. marketing_brands tem RLS SEM policies (padrão
// marketing_posts): TODAS as operações passam pelo admin client, org_id explícito.

// GET /api/marketing-brands — lista as marcas da org com arquivos e empreendimento.
export async function GET() {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("marketing_brands")
    .select(BRAND_SELECT)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data ?? [] })
}

// POST /api/marketing-brands — cria uma marca ("+ Nova marca").
export async function POST(req: NextRequest) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const parsed = validateMarketingBrandInput(await req.json().catch(() => null), {
    partial: false,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const consistency = validateBrandConsistency(parsed.value.tipo!, parsed.value.property_id ?? null)
  if (consistency) return NextResponse.json({ error: consistency }, { status: 400 })

  const { data, error } = await admin
    .from("marketing_brands")
    .insert({
      ...parsed.value,
      org_id: appUser.org_id,
      created_by: appUser.id,
    })
    .select(BRAND_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brand: data }, { status: 201 })
}
