import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  const searchParams = request.nextUrl.searchParams
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  let query = supabase
    .from("leads")
    .select("source")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)

  if (from) {
    query = query.gte("created_at", from)
  }
  if (to) {
    query = query.lte("created_at", to)
  }

  const { data: leads, error } = await query.limit(10000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by source
  const sourceCounts: Record<string, number> = {}
  for (const lead of leads ?? []) {
    const src = lead.source ?? "other"
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
  }

  const sources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  const total = sources.reduce((sum, s) => sum + s.count, 0)

  return NextResponse.json({ sources, total })
}
