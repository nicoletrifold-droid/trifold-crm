import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const LEADS_SELECT = `id, name, phone, stage_id, qualification_score, interest_level,
       property_interest_id, assigned_broker_id, created_at, updated_at,
       ai_summary, source, utm_campaign,
       properties:property_interest_id(name),
       users:assigned_broker_id(name)`

type RawLead = Record<string, unknown>

function normalizeLead(l: RawLead) {
  return {
    ...l,
    properties: Array.isArray(l.properties)
      ? (l.properties[0] as { name: string } | undefined) ?? null
      : (l.properties as { name: string } | null) ?? null,
    users: Array.isArray(l.users)
      ? (l.users[0] as { name: string } | undefined) ?? null
      : (l.users as { name: string } | null) ?? null,
  }
}

function passesScoreFilter(score: number | null | undefined, filter: string | null): boolean {
  if (!filter) return true
  const s = score ?? 0
  switch (filter) {
    case "high":
      return s >= 70
    case "medium":
      return s >= 40 && s < 70
    case "low":
      return s < 40
    default:
      return true
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth

  const searchParams = req.nextUrl.searchParams
  const stageId = searchParams.get("stage_id")
  const offsetParam = searchParams.get("offset")
  const limitParam = searchParams.get("limit")
  const propertyId = searchParams.get("property_id")
  const brokerId = searchParams.get("broker_id")
  const campaignId = searchParams.get("campaign_id")
  const score = searchParams.get("score")

  if (!stageId) {
    return NextResponse.json({ error: "MISSING_STAGE_ID" }, { status: 400 })
  }

  const offset = Math.max(0, Number.parseInt(offsetParam ?? "0", 10) || 0)
  const requestedLimit = Number.parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT)

  // Resolve campaign filter to lead id allowlist (parity with page.tsx logic).
  let campaignLeadIds: string[] | null = null
  if (campaignId) {
    const { data: entries } = await supabase
      .from("campaign_entries")
      .select("lead_id")
      .eq("campaign_id", campaignId)
      .not("lead_id", "is", null)

    campaignLeadIds = (entries ?? [])
      .map((e) => e.lead_id as string | null)
      .filter((id): id is string => Boolean(id))

    if (campaignLeadIds.length === 0) {
      return NextResponse.json({ leads: [], totalCount: 0, hasMore: false })
    }
  }

  let query = supabase
    .from("leads")
    .select(LEADS_SELECT, { count: "exact" })
    .eq("is_active", true)
    .eq("stage_id", stageId)

  if (propertyId) {
    query = query.eq("property_interest_id", propertyId)
  }
  if (brokerId) {
    query = query.eq("assigned_broker_id", brokerId)
  }
  if (campaignLeadIds && campaignLeadIds.length > 0) {
    query = query.in("id", campaignLeadIds)
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rawLeads = (data ?? []) as RawLead[]
  // Score filter remains JS-side (parity with page.tsx).
  const filtered = rawLeads.filter((l) =>
    passesScoreFilter(l.qualification_score as number | null | undefined, score)
  )
  const totalCount = count ?? rawLeads.length
  const hasMore = totalCount > offset + rawLeads.length

  return NextResponse.json({
    leads: filtered.map(normalizeLead),
    totalCount,
    hasMore,
  })
}
