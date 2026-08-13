import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Verify property belongs to user's org
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  const { data: typologies, error } = await supabase
    .from("typologies")
    .select("*")
    .eq("property_id", id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: typologies })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "imoveis.editar")
  if (forbidden) return forbidden

  // Verify property belongs to user's org
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  const body = await request.json()

  // Validation
  const errors: string[] = []
  if (!body.name?.trim()) errors.push("name is required")

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 })
  }

  const { data: typology, error } = await supabase
    .from("typologies")
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      bedrooms: body.bedrooms ?? null,
      bathrooms: body.bathrooms ?? null,
      area: body.area ?? null,
      base_price: body.base_price ?? null,
      property_id: id,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: typology }, { status: 201 })
}
