import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

export async function GET(
  req: NextRequest,
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

  // Build query with optional filters
  const searchParams = req.nextUrl.searchParams
  const status = searchParams.get("status")
  const floor = searchParams.get("floor")
  const typologyId = searchParams.get("typology_id")

  let query = supabase
    .from("units")
    .select("*, typologies(name)")
    .eq("property_id", id)
    .eq("is_active", true)
    .order("floor", { ascending: true })
    .order("identifier", { ascending: true })

  if (status) {
    query = query.eq("status", status)
  }

  if (floor) {
    query = query.eq("floor", parseInt(floor, 10))
  }

  if (typologyId) {
    query = query.eq("typology_id", typologyId)
  }

  const { data: units, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten typology name into each unit
  const unitsWithTypology = units?.map((unit) => {
    const { typologies, ...unitData } = unit
    return {
      ...unitData,
      typology_name: typologies?.name ?? null,
    }
  })

  return NextResponse.json({ data: unitsWithTypology })
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
  if (!body.identifier?.trim()) errors.push("identifier is required")
  if (body.floor === undefined || body.floor === null)
    errors.push("floor is required")
  if (!body.status?.trim()) errors.push("status is required")
  else if (!["available", "reserved", "sold"].includes(body.status))
    errors.push("status must be one of: available, reserved, sold")

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 })
  }

  const { data: unit, error } = await supabase
    .from("units")
    .insert({
      identifier: body.identifier.trim(),
      floor: body.floor,
      status: body.status.trim(),
      area: body.area ?? null,
      price: body.price ?? null,
      typology_id: body.typology_id ?? null,
      property_id: id,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: unit }, { status: 201 })
}
