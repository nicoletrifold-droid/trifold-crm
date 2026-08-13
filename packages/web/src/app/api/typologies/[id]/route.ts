import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: typology, error } = await supabase
    .from("typologies")
    .select("*, properties!inner(org_id)")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (error || !typology) {
    return NextResponse.json({ error: "Typology not found" }, { status: 404 })
  }

  // Verify org ownership via property
  if (typology.properties.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "Typology not found" }, { status: 404 })
  }

  // Remove nested properties from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { properties: _props, ...typologyData } = typology
  return NextResponse.json({ data: typologyData })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "imoveis.tipologias_editar")
  if (forbidden) return forbidden

  // Verify typology exists and belongs to user's org
  const { data: existing } = await supabase
    .from("typologies")
    .select("*, properties!inner(org_id)")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (!existing || existing.properties.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "Typology not found" }, { status: 404 })
  }

  const body = await request.json()

  const allowedFields = ["name", "description", "bedrooms", "bathrooms", "area", "base_price"]
  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  const { data: typology, error } = await supabase
    .from("typologies")
    .update(fields)
    .eq("id", id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !typology) {
    return NextResponse.json({ error: "Typology not found" }, { status: 404 })
  }

  return NextResponse.json({ data: typology })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "imoveis.apagar")
  if (forbidden) return forbidden

  // Verify typology exists and belongs to user's org
  const { data: existing } = await supabase
    .from("typologies")
    .select("*, properties!inner(org_id)")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (!existing || existing.properties.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "Typology not found" }, { status: 404 })
  }

  // Soft delete: set is_active=false
  const { error: deleteError } = await supabase
    .from("typologies")
    .update({ is_active: false })
    .eq("id", id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Unlink units from this typology
  const { error: unlinkError } = await supabase
    .from("units")
    .update({ typology_id: null })
    .eq("typology_id", id)

  if (unlinkError) {
    return NextResponse.json({ error: unlinkError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { message: "Typology deleted" } })
}
