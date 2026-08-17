import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { commercialDayRangeForOrg } from "@web/lib/metrics/commercial-day"
// Story 75-325 — mesma constante de equipe do Analytics (IMOB fora).
import { ANALYTICS_APPOINTMENT_TEAM } from "@web/lib/analytics/visits-rule"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const orgId = appUser.org_id
  const now = new Date()

  // "Leads hoje" usa o DIA COMERCIAL (vira no fechamento) em BRT — Story 75-57.
  // Corrige também o bug anterior, que usava meia-noite UTC (= 21h BRT do dia anterior).
  const { from: commercialDayStart } = await commercialDayRangeForOrg(orgId, supabase, now)
  const todayStart = commercialDayStart.toISOString()

  // Start of this week (Monday). Story 75-325: a semana é a de BRASÍLIA, não a de
  // UTC — entre 21h e a meia-noite de domingo as duas discordam sobre em que semana
  // estamos, e é justamente o horário em que o dia comercial vira.
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const dayOfWeek = brtNow.getUTCDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStartMs =
    Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate() - mondayOffset) +
    3 * 60 * 60 * 1000 // volta o deslocamento: 00:00 BRT em instante real
  const weekStart = new Date(weekStartMs).toISOString()
  const weekEnd = new Date(weekStartMs + 7 * 24 * 60 * 60 * 1000).toISOString()

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

    // Defensive: log if expected stages are missing, but do NOT throw.
    // Missing stages yield count=0 (via empty-string filter), preserving response shape.
    if (!qualificadoId) {
      console.warn(
        "[metrics] Stage 'qualificado' not found for org:",
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
      // Story 75-98: métricas do mundo principal — nunca contabilizam IMOB (.eq segmento principal).
      // Leads created today (dia comercial). is_active=true p/ bater com o card e o relatório (Story 75-57).
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("segmento", "principal")
        .eq("is_active", true)
        .gte("created_at", todayStart),

      // Qualified leads this week
      // Note: schema has no `qualified_at` column; using `updated_at` as proxy
      // for "moved to qualified stage" (best available without schema change).
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("segmento", "principal")
        .eq("stage_id", qualificadoId ?? "")
        .gte("updated_at", weekStart),

      // Visitas marcadas para esta semana — Story 75-325.
      //
      // Lia `leads.visit_scheduled_at` cruzado com a etapa "Visita Agendada", e as
      // duas condições estavam erradas. A coluna é preenchida por poucos caminhos de
      // escrita: medido em prod (17/08/2026), 12 leads têm `visit_scheduled_at`
      // contra 59 leads COM agendamento — 52 leads têm visita marcada e a coluna nula.
      // E exigir a etapa atual = "Visita Agendada" descartava quem já visitou. O
      // resultado da conta inteira era 0, com 8 leads na etapa e 4 compromissos
      // futuros na agenda.
      //
      // A agenda é a fonte da verdade de agendamento: `appointments`. Canceladas
      // ficam de fora (visita desmarcada não foi marcada para esta semana); as
      // demais contam, inclusive as que já aconteceram — a pergunta é sobre a
      // semana, não sobre o futuro.
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("team", ANALYTICS_APPOINTMENT_TEAM) // agenda IMOB fora (Epic 81)
        .neq("status", "cancelled")
        .gte("scheduled_at", weekStart)
        .lt("scheduled_at", weekEnd),

      // Total leads this month (for qualification rate)
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("segmento", "principal")
        .gte("created_at", monthStart),

      // Qualified leads this month (for qualification rate)
      // Same proxy decision: `updated_at` stands in for missing `qualified_at`.
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("segmento", "principal")
        .eq("stage_id", qualificadoId ?? "")
        .gte("updated_at", monthStart),

      // Pipeline counts by stage (now keyed by stage_id UUID, not text)
      supabase
        .from("leads")
        .select("stage_id")
        .eq("org_id", orgId)
        .eq("segmento", "principal")
        .eq("is_active", true),

      // Leads by property
      supabase
        .from("leads")
        .select("property_id, properties(name)")
        .eq("org_id", orgId)
        .eq("segmento", "principal")
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
