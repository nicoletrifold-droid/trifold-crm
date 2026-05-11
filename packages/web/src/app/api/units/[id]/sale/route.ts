import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { autoVincularClienteObra } from "@web/lib/auto-vincular-cliente-obra"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: unitId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  // Verify unit exists and belongs to user's org
  const { data: unit } = await supabase
    .from("units")
    .select("*, properties!inner(org_id)")
    .eq("id", unitId)
    .eq("is_active", true)
    .single()

  if (!unit || unit.properties.org_id !== appUser.org_id) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  const body = await request.json()

  if (!body.sale_price || Number(body.sale_price) <= 0) {
    return NextResponse.json(
      { error: "sale_price is required and must be positive" },
      { status: 400 }
    )
  }

  let leadId = body.lead_id || null
  const isExistingLead = !!leadId

  // If create_lead is true and no lead_id, create a new lead
  if (body.create_lead && !leadId) {
    if (!body.client_phone?.trim()) {
      return NextResponse.json(
        { error: "client_phone is required to create a lead" },
        { status: 400 }
      )
    }

    // Check if lead with this phone already exists
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("phone", body.client_phone.trim())
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .maybeSingle()

    if (existingLead) {
      leadId = existingLead.id
    } else {
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          name: body.client_name?.trim() || null,
          phone: body.client_phone.trim(),
          email: body.client_email?.trim() || null,
          channel: "manual",
          source: "sale",
          org_id: appUser.org_id,
          is_active: true,
        })
        .select("id")
        .single()

      if (leadError) {
        return NextResponse.json(
          { error: `Failed to create lead: ${leadError.message}` },
          { status: 500 }
        )
      }
      leadId = newLead.id
    }
  }

  // Create sale record
  const { data: sale, error: saleError } = await supabase
    .from("unit_sales")
    .insert({
      org_id: appUser.org_id,
      unit_id: unitId,
      lead_id: leadId,
      broker_id: body.broker_id || null,
      sale_price: Number(body.sale_price),
      payment_method: body.payment_method || null,
      payment_details: body.payment_details || {},
      sold_at: body.sold_at || new Date().toISOString(),
      notes: body.notes?.trim() || null,
      client_name: body.client_name?.trim() || null,
      client_phone: body.client_phone?.trim() || null,
      client_email: body.client_email?.trim() || null,
      client_cpf: body.client_cpf?.trim() || null,
      is_existing_lead: isExistingLead,
    })
    .select()
    .single()

  if (saleError) {
    return NextResponse.json(
      { error: `Failed to record sale: ${saleError.message}` },
      { status: 500 }
    )
  }

  // Update unit status to sold
  const { error: unitError } = await supabase
    .from("units")
    .update({
      status: "sold",
      sold_at: body.sold_at || new Date().toISOString(),
    })
    .eq("id", unitId)

  if (unitError) {
    return NextResponse.json(
      { error: `Sale recorded but failed to update unit: ${unitError.message}` },
      { status: 500 }
    )
  }

  // Auto-vincular comprador à obra do empreendimento (tolerante a falhas — não reverte a venda)
  const portalVinculado = await autoVincularClienteObra({
    unitId,
    orgId: appUser.org_id,
    clientEmail: body.client_email?.trim() || null,
    clientName: body.client_name?.trim() || null,
  }).then((r) => r.vinculado).catch(() => false)

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: leadId,
    user_id: appUser.id,
    type: "unit_sold",
    description: `Unidade ${unit.identifier} vendida por R$ ${Number(body.sale_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    metadata: {
      unit_id: unitId,
      sale_id: sale.id,
      sale_price: body.sale_price,
      payment_method: body.payment_method,
      broker_id: body.broker_id,
    },
  })

  return NextResponse.json({ data: sale, portal_vinculado: portalVinculado }, { status: 201 })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: unitId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: sale, error } = await supabase
    .from("unit_sales")
    .select("*")
    .eq("unit_id", unitId)
    .eq("org_id", appUser.org_id)
    .order("sold_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: sale })
}
