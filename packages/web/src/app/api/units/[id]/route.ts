import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"
import { IMOVEIS_EDIT_ROLES } from "@web/lib/permissions-imoveis"

const VALID_TRANSITIONS: Record<string, string[]> = {
  available: ["reserved", "sold"],
  reserved: ["available", "sold"],
  sold: [],
}

function isValidTransition(
  from: string,
  to: string,
  role: string
): { valid: boolean; reason?: string } {
  // Admin can reset any status to available
  if (role === "admin" && to === "available") {
    return { valid: true }
  }

  const allowed = VALID_TRANSITIONS[from]
  if (!allowed) {
    return { valid: false, reason: `Unknown current status: ${from}` }
  }

  if (!allowed.includes(to)) {
    return {
      valid: false,
      reason: `Cannot transition from '${from}' to '${to}'`,
    }
  }

  return { valid: true }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: unit, error } = await supabase
    .from("units")
    .select("*, typologies(*), properties!inner(id, name, org_id)")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (error || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  // Verify org ownership via property
  if (unit.properties.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  // Clean up response: remove org_id from nested property
  const { properties, typologies, ...unitData } = unit
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { org_id: _orgId, ...propertyData } = properties

  return NextResponse.json({
    data: {
      ...unitData,
      property: propertyData,
      typology: typologies ?? null,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, [...IMOVEIS_EDIT_ROLES])
  if (forbidden) return forbidden

  // Verify unit exists and belongs to user's org
  const { data: existing } = await supabase
    .from("units")
    .select("*, properties!inner(org_id)")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (!existing || existing.properties.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  const body = await request.json()

  // Validate status transition if status is being changed
  if (body.status !== undefined) {
    if (!["available", "reserved", "sold"].includes(body.status)) {
      return NextResponse.json(
        { error: "status must be one of: available, reserved, sold" },
        { status: 400 }
      )
    }

    if (body.status !== existing.status) {
      const transition = isValidTransition(
        existing.status,
        body.status,
        appUser.role
      )
      if (!transition.valid) {
        return NextResponse.json(
          { error: transition.reason },
          { status: 400 }
        )
      }
    }
  }

  const allowedFields = ["identifier", "floor", "status", "area", "price", "typology_id"]
  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  const { data: unit, error } = await supabase
    .from("units")
    .update(fields)
    .eq("id", id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  return NextResponse.json({ data: unit })
}
