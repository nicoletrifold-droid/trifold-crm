import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { KanbanBoard } from "@web/components/pipeline/kanban-board"
import Link from "next/link"

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const filters = await searchParams
  const user = await getServerUser()
  const supabase = await createClient()

  const [{ data: stages }, { data: properties }, { data: brokers }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("kanban_stages")
        .select("id, name, slug, color, position")
        .eq("is_active", true)
        .order("position"),
      supabase
        .from("properties")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("users")
        .select("id, name")
        .eq("org_id", user.orgId)
        .eq("role", "broker")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("campaigns")
        .select("id, name")
        .order("created_at", { ascending: false }),
    ])

  let leadsQuery = supabase
    .from("leads")
    .select(
      `id, name, phone, stage_id, qualification_score, interest_level,
       property_interest_id, assigned_broker_id, created_at, updated_at,
       ai_summary, utm_campaign,
       properties:property_interest_id(name),
       users:assigned_broker_id(name)`
    )
    .eq("is_active", true)

  if (filters.property_id) {
    leadsQuery = leadsQuery.eq("property_interest_id", filters.property_id)
  }

  if (filters.broker_id) {
    leadsQuery = leadsQuery.eq("assigned_broker_id", filters.broker_id)
  }

  if (filters.campaign_id) {
    const { data: campaignLeadIds } = await supabase
      .from("campaign_entries")
      .select("lead_id")
      .eq("campaign_id", filters.campaign_id)
      .not("lead_id", "is", null)

    const ids = (campaignLeadIds ?? []).map((e) => e.lead_id).filter(Boolean)
    if (ids.length > 0) {
      leadsQuery = leadsQuery.in("id", ids)
    } else {
      leadsQuery = leadsQuery.eq("id", "00000000-0000-0000-0000-000000000000")
    }
  }

  const { data: leads } = await leadsQuery.order("updated_at", {
    ascending: false,
  })

  let filteredLeads = leads ?? []

  if (filters.score) {
    filteredLeads = filteredLeads.filter((l) => {
      const score = (l.qualification_score as number) ?? 0
      switch (filters.score) {
        case "high":
          return score >= 70
        case "medium":
          return score >= 40 && score < 70
        case "low":
          return score < 40
        default:
          return true
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="text-sm text-gray-500">
          {filteredLeads.length} leads no pipeline
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <form className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500">
              Empreendimento
            </label>
            <select
              name="property_id"
              defaultValue={filters.property_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">
              Corretor
            </label>
            <select
              name="broker_id"
              defaultValue={filters.broker_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              {brokers?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">
              Campanha
            </label>
            <select
              name="campaign_id"
              defaultValue={filters.campaign_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todas</option>
              {campaigns?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">
              Score
            </label>
            <select
              name="score"
              defaultValue={filters.score ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              <option value="high">Alto (&ge;70)</option>
              <option value="medium">Médio (40-69)</option>
              <option value="low">Baixo (&lt;40)</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Filtrar
          </button>

          {(filters.property_id || filters.broker_id || filters.score || filters.campaign_id) && (
            <Link
              href="/dashboard/pipeline"
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Limpar
            </Link>
          )}

          <Link
            href="/dashboard/pipeline/config"
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Config follow-up
          </Link>
        </form>
      </div>

      <KanbanBoard
        initialStages={stages ?? []}
        initialLeads={filteredLeads.map((l: Record<string, unknown>) => ({
          ...l,
          properties: Array.isArray(l.properties) ? l.properties[0] ?? null : l.properties ?? null,
          users: Array.isArray(l.users) ? l.users[0] ?? null : l.users ?? null,
        })) as Parameters<typeof KanbanBoard>[0]["initialLeads"]}
      />
    </div>
  )
}
