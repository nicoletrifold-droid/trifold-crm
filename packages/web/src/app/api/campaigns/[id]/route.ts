import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

// GET — Campaign detail with metrics
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id } = await params

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(
      `*, properties:property_id(name)`
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  // Get entry metrics
  const { data: entries } = await supabase
    .from("campaign_entries")
    .select(
      "whatsapp_status, email_status, is_valid_phone, is_valid_email, has_responded"
    )
    .eq("campaign_id", id)

  const e = entries ?? []
  const metrics = {
    total: e.length,
    whatsapp: {
      sent: e.filter((x) => x.whatsapp_status !== "pending").length,
      delivered: e.filter((x) =>
        ["delivered", "read"].includes(x.whatsapp_status)
      ).length,
      read: e.filter((x) => x.whatsapp_status === "read").length,
      failed: e.filter((x) => x.whatsapp_status === "failed").length,
    },
    email: {
      sent: e.filter((x) => x.email_status !== "pending").length,
      delivered: e.filter((x) =>
        ["delivered", "opened"].includes(x.email_status)
      ).length,
      opened: e.filter((x) => x.email_status === "opened").length,
      bounced: e.filter((x) => x.email_status === "bounced").length,
    },
    valid: e.filter((x) => x.is_valid_phone && x.is_valid_email).length,
    responded: e.filter((x) => x.has_responded).length,
  }

  return NextResponse.json({
    data: {
      ...campaign,
      properties: Array.isArray(campaign.properties)
        ? campaign.properties[0] ?? null
        : campaign.properties ?? null,
      metrics,
    },
  })
}

// PATCH — Update campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id } = await params
  const body = await request.json()

  // Only allow updating specific fields (not slug)
  const allowedFields = [
    "name",
    "description",
    "starts_at",
    "ends_at",
    "form_url",
    "google_form_id",
    "whatsapp_template_name",
    "email_enabled",
    "email_subject",
    "email_body_html",
    "field_mapping",
    "property_id",
  ]

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  // If form_url changed, extract new form_id
  if (body.form_url) {
    const match = body.form_url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)
    updates.google_form_id = match?.[1] ?? null
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
