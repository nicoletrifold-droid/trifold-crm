import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildUpdatePayload, softDelete } from "@web/lib/api-utils"
import { logAudit, getRequestIp } from "@web/lib/audit"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      `
      *,
      stage:kanban_stages(id, name, slug, type, color),
      property_interest:properties!property_interest_id(id, name, slug),
      broker:users!assigned_broker_id(id, name, email, avatar_url)
    `
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  return NextResponse.json({ data: lead })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Check permission: admin/supervisor or assigned broker
  if (!["admin", "supervisor"].includes(appUser.role)) {
    const { data: lead } = await supabase
      .from("leads")
      .select("assigned_broker_id")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .single()

    if (!lead || lead.assigned_broker_id !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const body = await request.json()

  const allowedFields = [
    "name",
    "phone",
    "email",
    "channel",
    "stage_id",
    "property_interest_id",
    "has_down_payment",
    "preferred_bedrooms",
    "preferred_floor",
    "preferred_view",
    "preferred_garage_count",
    "qualification_status",
    "qualification_score",
    "interest_level",
    "source",
    "assigned_broker_id",
    "ai_summary",
    "visit_scheduled_at",
    "lost_reason",
  ]

  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  const { data: lead, error } = await supabase
    .from("leads")
    .update(fields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.update",
    entity_type: "lead",
    entity_id: id,
    entity_name: (lead.name as string | null) ?? undefined,
    ip_address: getRequestIp(request.headers),
  })

  return NextResponse.json({ data: lead })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  // Snapshot ANTES do softDelete — a função não retorna o nome.
  const { data: leadSnapshot } = await supabase
    .from("leads")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  const result = await softDelete(supabase, "leads", id, appUser.org_id)
  if (result.error) return result.error

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "lead.delete",
    entity_type: "lead",
    entity_id: id,
    entity_name: leadSnapshot?.name ?? id,
    ip_address: getRequestIp(_req.headers),
  })

  return NextResponse.json({ data: { message: "Lead deleted" } })
}
