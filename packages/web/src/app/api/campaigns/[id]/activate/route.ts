import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id } = await params

  // Get campaign to validate
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, google_form_id, field_mapping, status")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  if (campaign.status === "active") {
    return NextResponse.json({ error: "Campaign is already active" }, { status: 400 })
  }

  if (!campaign.google_form_id) {
    return NextResponse.json(
      { error: "Cannot activate: Google Form ID is missing. Add a form URL first." },
      { status: 400 }
    )
  }

  const mapping = campaign.field_mapping as Record<string, unknown> | null
  if (!mapping || Object.keys(mapping).length === 0) {
    return NextResponse.json(
      { error: "Cannot activate: field mapping is empty. Configure field mapping first." },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
