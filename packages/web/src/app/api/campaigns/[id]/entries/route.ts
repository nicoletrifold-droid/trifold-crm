import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get("limit") ?? "50")
  const offset = parseInt(searchParams.get("offset") ?? "0")
  const status = searchParams.get("status") // valid, invalid, responded

  let query = supabase
    .from("campaign_entries")
    .select(
      "id, name, phone, email, custom_data, whatsapp_status, email_status, is_valid_phone, is_valid_email, has_responded, created_at",
      { count: "exact" }
    )
    .eq("campaign_id", id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === "valid") {
    query = query.eq("is_valid_phone", true).eq("is_valid_email", true)
  } else if (status === "invalid") {
    query = query.or("is_valid_phone.eq.false,is_valid_email.eq.false")
  } else if (status === "responded") {
    query = query.eq("has_responded", true)
  }

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, total: count })
}
