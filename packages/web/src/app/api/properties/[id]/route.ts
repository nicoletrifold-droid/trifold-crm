import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { softDelete } from "@web/lib/api-utils"
import { IMOVEIS_EDIT_ROLES, IMOVEIS_CREATE_ROLES } from "@web/lib/permissions-imoveis"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: property, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (error || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  return NextResponse.json({ data: property })
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Editar empreendimento: admin/supervisor/obras (fonte única).
  const forbidden = requireRole(appUser, [...IMOVEIS_EDIT_ROLES])
  if (forbidden) return forbidden

  const body = await request.json()

  // Validate state if provided
  if (body.state !== undefined) {
    if (!body.state?.trim() || body.state.trim().length !== 2) {
      return NextResponse.json(
        { error: "state must be exactly 2 characters" },
        { status: 400 }
      )
    }
  }

  // Build update payload with only provided fields
  const updateFields: Record<string, unknown> = {}
  if (body.name !== undefined) updateFields.name = body.name.trim()
  if (body.slug !== undefined) updateFields.slug = body.slug.trim()
  if (body.status !== undefined) updateFields.status = body.status
  if (body.city !== undefined) updateFields.city = body.city.trim()
  if (body.state !== undefined)
    updateFields.state = body.state.trim().toUpperCase()
  if (body.address !== undefined) updateFields.address = body.address?.trim() || null
  if (body.neighborhood !== undefined) updateFields.neighborhood = body.neighborhood?.trim() || null
  if (body.zip_code !== undefined)
    updateFields.zip_code = body.zip_code?.trim() || null
  if (body.concept !== undefined) updateFields.concept = body.concept?.trim() || null
  if (body.description !== undefined) updateFields.description = body.description?.trim() || null
  if (body.delivery_date !== undefined) updateFields.delivery_date = body.delivery_date || null
  if (body.total_units !== undefined) updateFields.total_units = body.total_units
  if (body.total_floors !== undefined) updateFields.total_floors = body.total_floors
  if (body.units_per_floor !== undefined) updateFields.units_per_floor = body.units_per_floor
  if (body.type_floors !== undefined) updateFields.type_floors = body.type_floors
  if (body.basement_floors !== undefined) updateFields.basement_floors = body.basement_floors
  if (body.leisure_floors !== undefined) updateFields.leisure_floors = body.leisure_floors
  if (body.amenities !== undefined) updateFields.amenities = body.amenities
  if (body.differentials !== undefined) updateFields.differentials = body.differentials
  if (body.commercial_rules !== undefined) updateFields.commercial_rules = body.commercial_rules
  if (body.faq !== undefined) updateFields.faq = body.faq
  if (body.restrictions !== undefined) updateFields.restrictions = body.restrictions
  if (body.video_tour_url !== undefined) updateFields.video_tour_url = body.video_tour_url?.trim() || null

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    )
  }

  const { data: property, error } = await supabase
    .from("properties")
    .update(updateFields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  return NextResponse.json({ data: property })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Excluir empreendimento: admin/supervisor (fonte única).
  const forbidden = requireRole(appUser, [...IMOVEIS_CREATE_ROLES])
  if (forbidden) return forbidden

  const result = await softDelete(supabase, "properties", id, appUser.org_id)
  if (result.error) return result.error

  return NextResponse.json({ data: { message: "Property deleted" } })
}
