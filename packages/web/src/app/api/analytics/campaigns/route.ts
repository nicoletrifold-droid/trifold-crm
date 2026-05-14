import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

// Story 30.1: shape mínimo retornado pelo Supabase (sem array de UUIDs).
// O join `stage:kanban_stages(slug)` retorna single object via PostgREST quando há
// 1 FK em leads.stage_id — mas o cliente JS tipa como array, então normalizamos.
type LeadRow = {
  utm_campaign: string | null
  stage: { slug: string | null } | Array<{ slug: string | null }> | null
}

const extractStageSlug = (s: LeadRow["stage"]): string | null => {
  if (!s) return null
  if (Array.isArray(s)) return s[0]?.slug ?? null
  return s.slug ?? null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  const searchParams = request.nextUrl.searchParams
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  // Story 30.1: select mínimo (sem `id`, sem arrays de UUIDs aninhados).
  // Mantemos o JOIN escalar `stage:kanban_stages(slug)` (1 row por lead, não array de leads).
  // Removido o .limit(10000) arbitrário — o filtro `utm_campaign IS NOT NULL` + index garante
  // que a varredura cobre apenas leads com campanha. Classificação JS é trivial pós-filtro.
  let query = supabase
    .from("leads")
    .select("utm_campaign, stage:kanban_stages(slug)")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .not("utm_campaign", "is", null)

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

  const leads = (data as LeadRow[] | null) ?? []

  // Group by utm_campaign + CASE WHEN classification
  const campaignMap: Record<
    string,
    { total: number; qualified: number; converted: number }
  > = {}

  for (const lead of leads) {
    const campaign = lead.utm_campaign
    if (!campaign) continue
    if (!campaignMap[campaign]) {
      campaignMap[campaign] = { total: 0, qualified: 0, converted: 0 }
    }
    campaignMap[campaign].total += 1

    const stageSlug = extractStageSlug(lead.stage)

    // Count qualified (any stage beyond initial)
    if (stageSlug && !["novo", "new", "nao_qualificado"].includes(stageSlug)) {
      campaignMap[campaign].qualified += 1
    }

    // Count converted (stage = fechou)
    if (stageSlug === "fechou") {
      campaignMap[campaign].converted += 1
    }
  }

  const campaigns = Object.entries(campaignMap)
    .map(([name, agg]) => ({
      campaign: name,
      total: agg.total,
      qualified: agg.qualified,
      converted: agg.converted,
    }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ data: campaigns })
}
