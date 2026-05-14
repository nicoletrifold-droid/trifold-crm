import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const orgId = appUser.org_id
  const now = new Date()

  // Start of today (UTC)
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString()

  // Start of this week (Monday)
  const dayOfWeek = now.getUTCDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - mondayOffset
    )
  ).toISOString()

  // Start of this month
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString()

  try {
    // Load kanban_stages for this org to resolve slug -> stage_id (UUID).
    // The leads table has stage_id (UUID FK to kanban_stages), NOT a text `stage` column.
    // Filtering by `.eq("stage", "qualified")` silently returned 0 rows.
    const { data: stageRows, error: stageError } = await supabase
      .from("kanban_stages")
      .select("id, slug")
      .eq("org_id", orgId)
      .eq("is_active", true)

    if (stageError) {
      console.error("[metrics] Failed to load kanban_stages", stageError)
      return NextResponse.json(
        { error: "Failed to load stages" },
        { status: 500 }
      )
    }

    const stageMap: Record<string, string> = Object.fromEntries(
      (stageRows ?? []).map((s) => [s.slug, s.id])
    )

    const qualificadoId = stageMap["qualificado"]
    const visitaAgendadaId = stageMap["visita-agendada"]

    // Defensive: log if expected stages are missing, but do NOT throw.
    // Missing stages yield count=0 (via empty-string filter), preserving response shape.
    if (!qualificadoId) {
      console.warn(
        "[metrics] Stage 'qualificado' not found for org:",
        orgId
      )
    }
    if (!visitaAgendadaId) {
      console.warn(
        "[metrics] Stage 'visita-agendada' not found for org:",
        orgId
      )
    }

    // Run all queries in parallel
    const [
      leadsTodayResult,
      qualifiedLeadsWeekResult,
      scheduledVisitsWeekResult,
      totalLeadsMonthResult,
      qualifiedLeadsMonthResult,
      pipelineCountsResult,
      leadsByPropertyResult,
    ] = await Promise.all([
      // Leads created today
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("created_at", todayStart),

      // Qualified leads this week
      // Note: schema has no `qualified_at` column; using `updated_at` as proxy
      // for "moved to qualified stage" (best available without schema change).
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("stage_id", qualificadoId ?? "")
        .gte("updated_at", weekStart),

      // Scheduled visits this week (visit_scheduled_at column exists in schema)
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("stage_id", visitaAgendadaId ?? "")
        .gte("visit_scheduled_at", weekStart),

      // Total leads this month (for qualification rate)
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("created_at", monthStart),

      // Qualified leads this month (for qualification rate)
      // Same proxy decision: `updated_at` stands in for missing `qualified_at`.
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("stage_id", qualificadoId ?? "")
        .gte("updated_at", monthStart),

      // Pipeline counts by stage (now keyed by stage_id UUID, not text)
      supabase
        .from("leads")
        .select("stage_id")
        .eq("org_id", orgId)
        .eq("is_active", true),

      // Leads by property
      supabase
        .from("leads")
        .select("property_id, properties(name)")
        .eq("org_id", orgId)
        .eq("is_active", true),
    ])

    // Calculate qualification rate
    const totalLeadsMonth = totalLeadsMonthResult.count ?? 0
    const qualifiedLeadsMonth = qualifiedLeadsMonthResult.count ?? 0
    const qualificationRate =
      totalLeadsMonth > 0
        ? Math.round((qualifiedLeadsMonth / totalLeadsMonth) * 100)
        : 0

    // Aggregate pipeline counts by stage_id (UUID keys — schema correctness)
    const pipelineCounts: Record<string, number> = {}
    if (pipelineCountsResult.data) {
      for (const lead of pipelineCountsResult.data) {
        if (!lead.stage_id) continue
        pipelineCounts[lead.stage_id] =
          (pipelineCounts[lead.stage_id] || 0) + 1
      }
    }

    // Aggregate leads by property
    const leadsByProperty: Record<string, { name: string; count: number }> = {}
    if (leadsByPropertyResult.data) {
      for (const lead of leadsByPropertyResult.data) {
        const propertyId = lead.property_id
        if (!propertyId) continue

        if (!leadsByProperty[propertyId]) {
          const propertyData = lead.properties as unknown as { name: string } | null
          leadsByProperty[propertyId] = {
            name: propertyData?.name ?? "Unknown",
            count: 0,
          }
        }
        leadsByProperty[propertyId].count += 1
      }
    }

    const metrics = {
      leads_today: leadsTodayResult.count ?? 0,
      qualified_leads_week: qualifiedLeadsWeekResult.count ?? 0,
      scheduled_visits_week: scheduledVisitsWeekResult.count ?? 0,
      qualification_rate_month: qualificationRate,
      pipeline_counts: pipelineCounts,
      leads_by_property: Object.values(leadsByProperty),
    }

    return NextResponse.json({ data: metrics })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch metrics"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
