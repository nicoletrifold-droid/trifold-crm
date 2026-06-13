import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { campaign_id: metaCampaignId } = await params
  const { searchParams } = request.nextUrl
  const days = Math.min(parseInt(searchParams.get("days") ?? "30"), 90)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffDate = cutoff.toISOString().split("T")[0]!

  const { data: alerts, error } = await supabase
    .from("meta_alerts")
    .select("id, alert_type, level, entity_id, severity, message, metadata, is_read, fired_date, created_at")
    .eq("org_id", appUser.org_id)
    .eq("entity_id", metaCampaignId)
    .gte("fired_date", cutoffDate)
    .order("fired_date", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alerts: alerts ?? [] })
}
