import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

type Granularity = "day" | "week" | "month"

interface PeriodEntry {
  period: string
  count: number
  byProperty: Record<string, number>
}

function getPeriodKey(isoDate: string, granularity: Granularity): string {
  const d = new Date(isoDate)
  // BRT = UTC-3
  const brtMs = d.getTime() - 3 * 60 * 60 * 1000
  const brt = new Date(brtMs)

  if (granularity === "day") {
    return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`
  }
  if (granularity === "week") {
    const day = brt.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    brt.setUTCDate(brt.getUTCDate() + diff)
    return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`
  }
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}`
}

function generatePeriods(from: string, to: string, granularity: Granularity): string[] {
  const periods: string[] = []
  const start = new Date(from)
  const end = new Date(to)

  if (granularity === "day") {
    const cur = new Date(
      `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}T03:00:00Z`
    )
    const endSnap = new Date(
      `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}T03:00:00Z`
    )
    while (cur <= endSnap) {
      periods.push(
        `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`
      )
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
  } else if (granularity === "week") {
    const cur = new Date(start)
    const day = cur.getUTCDay()
    cur.setUTCDate(cur.getUTCDate() - (day === 0 ? 6 : day - 1))
    cur.setUTCHours(3, 0, 0, 0)
    while (cur <= end) {
      periods.push(
        `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`
      )
      cur.setUTCDate(cur.getUTCDate() + 7)
    }
  } else {
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
    while (cur <= endMonth) {
      periods.push(
        `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`
      )
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
  }

  return periods
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  const sp = request.nextUrl.searchParams
  const from = sp.get("from")
  const to = sp.get("to")
  const granularity = (sp.get("granularity") ?? "day") as Granularity
  const propertyId = sp.get("property") ?? ""
  const source = sp.get("source") ?? ""

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 })
  }
  if (!["day", "week", "month"].includes(granularity)) {
    return NextResponse.json({ error: "Invalid granularity" }, { status: 400 })
  }

  // Parallel: leads + property names
  let leadsQuery = supabase
    .from("leads")
    .select("created_at, property_interest_id")
    .eq("is_active", true)
    .is("lost_reason", null)
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at")

  if (source) leadsQuery = leadsQuery.eq("source", source as "whatsapp_organic" | "whatsapp_click_to_ad" | "meta_ads" | "website" | "referral" | "walk_in" | "telegram" | "other")

  const [{ data: rawLeads, error }, { data: rawProperties }] = await Promise.all([
    leadsQuery,
    supabase.from("properties").select("id, name").eq("is_active", true),
  ])

  if (error) {
    console.error("[ANALYTICS/leads-by-period]", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const propNames = new Map((rawProperties ?? []).map((p) => [p.id, p.name]))

  // Fill all periods (including zeros)
  const allPeriods = generatePeriods(from, to, granularity)
  const periodMap = new Map<string, PeriodEntry>()
  for (const p of allPeriods) {
    periodMap.set(p, { period: p, count: 0, byProperty: {} })
  }

  // Aggregate
  for (const lead of rawLeads ?? []) {
    const period = getPeriodKey(lead.created_at, granularity)
    const entry = periodMap.get(period)
    if (!entry) continue

    const propName = lead.property_interest_id ? (propNames.get(lead.property_interest_id) ?? "Outro") : "Outro"
    entry.byProperty[propName] = (entry.byProperty[propName] ?? 0) + 1

    // Apply property filter for bar height
    if (!propertyId || lead.property_interest_id === propertyId) {
      entry.count++
    }
  }

  const data = allPeriods.map((p) => periodMap.get(p)!)

  const total = data.reduce((sum, d) => sum + d.count, 0)
  const peakEntry = data.reduce(
    (max, d) => (d.count > max.count ? d : max),
    data[0] ?? { period: "", count: 0, byProperty: {} }
  )
  const days = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)))

  return NextResponse.json({
    data,
    summary: {
      total,
      dailyAvg: Math.round((total / days) * 10) / 10,
      peakPeriod: peakEntry.period,
      peakCount: peakEntry.count,
    },
  })
}
