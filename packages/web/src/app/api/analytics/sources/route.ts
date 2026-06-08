import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

// Story 30.1: shape escalar simples (1 campo `source` por lead).
// Aceitável manter GROUP BY em JS — o over-fetch real era apenas o .limit(10000)
// arbitrário que truncava sem necessidade. Sem array de UUIDs, sem joins aninhados.
type LeadSourceRow = { source: string | null }

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  const searchParams = request.nextUrl.searchParams
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  // Story 30.1: select escalar mínimo, sem .limit(10000) arbitrário.
  // Sem joins aninhados, sem arrays de UUIDs — over-fetch estrutural eliminado.
  let query = supabase
    .from("leads")
    .select("source")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .is("lost_reason", null)

  if (from) {
    query = query.gte("created_at", from)
  }
  if (to) {
    query = query.lte("created_at", to)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const leads = (data as LeadSourceRow[] | null) ?? []

  // GROUP BY source em JS — payload já escalar, custo trivial.
  const sourceCounts: Record<string, number> = {}
  for (const lead of leads) {
    const src = lead.source ?? "other"
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
  }

  const sources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  const total = sources.reduce((sum, s) => sum + s.count, 0)

  return NextResponse.json({ sources, total })
}
