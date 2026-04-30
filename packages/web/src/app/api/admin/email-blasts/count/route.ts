import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(request.url)
  const segmentType = url.searchParams.get("segment_type") ?? "all"
  const stageIds = url.searchParams.getAll("stage_id")
  const sources = url.searchParams.getAll("source")
  const propertyId = url.searchParams.get("property_id")

  const supabase = createAdminClient()

  let query = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .not("email", "is", null)

  if (segmentType === "by_stage" && stageIds.length > 0) {
    query = query.in("stage_id", stageIds)
  }
  if (segmentType === "by_source" && sources.length > 0) {
    query = query.in("source", sources)
  }
  if (segmentType === "by_property" && propertyId) {
    query = query.eq("property_interest_id", propertyId)
  }

  const { count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ count: count ?? 0 })
}
