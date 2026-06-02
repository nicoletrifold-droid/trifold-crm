import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { triggerAutomations } from "@web/lib/email-automations"
import { logAudit, getRequestIp } from "@web/lib/audit"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const url = new URL(request.url)
  const rawSearch = url.searchParams.get("search")
  const search = rawSearch && rawSearch.length <= 100 ? rawSearch : null
  const stageId = url.searchParams.get("stage_id")
  const propertyId = url.searchParams.get("property_id")
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "50")), 100)
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("leads")
    .select(
      "id, name, phone, email, stage_id, qualification_score, interest_level, property_interest_id, assigned_broker_id, source, created_at, updated_at",
      { count: "exact" }
    )
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .range(from, to)

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  if (stageId) {
    query = query.eq("stage_id", stageId)
  }

  if (propertyId) {
    query = query.eq("property_interest_id", propertyId)
  }

  const { data: leads, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: leads, count, page, limit })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const isBroker = appUser.role === "broker"
  if (!isBroker) {
    const forbidden = requireRole(appUser, ["admin", "supervisor"])
    if (forbidden) return forbidden
  }

  const body = await request.json()

  // Validation
  if (!body.phone?.trim()) {
    return NextResponse.json(
      { error: "phone is required" },
      { status: 400 }
    )
  }

  // Check uniqueness by phone + org_id
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("phone", body.phone.trim())
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "Lead with this phone already exists" },
      { status: 409 }
    )
  }

  // Brokers can only create leads assigned to themselves
  const assignedBrokerId = isBroker ? appUser.id : (body.assigned_broker_id || null)

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      name: body.name?.trim() || null,
      phone: body.phone.trim(),
      email: body.email?.trim() || null,
      channel: body.channel || "whatsapp",
      stage_id: body.stage_id || null,
      property_interest_id: body.property_interest_id || null,
      has_down_payment: body.has_down_payment ?? null,
      preferred_bedrooms: body.preferred_bedrooms ?? null,
      preferred_floor: body.preferred_floor?.trim() || null,
      preferred_view: body.preferred_view?.trim() || null,
      preferred_garage_count: body.preferred_garage_count ?? null,
      interest_level: body.interest_level || null,
      source: body.source || "manual",
      assigned_broker_id: assignedBrokerId,
      org_id: appUser.org_id,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (lead) {
    void triggerAutomations("lead.created", {
      id: lead.id,
      email: lead.email ?? null,
      name: lead.name ?? null,
      phone: lead.phone ?? null,
      org_id: lead.org_id as string,
    })

    void logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "lead.create",
      entity_type: "lead",
      entity_id: lead.id as string,
      entity_name: (lead.name as string | null) ?? undefined,
      ip_address: getRequestIp(request.headers),
    })
  }

  return NextResponse.json({ data: lead }, { status: 201 })
}
