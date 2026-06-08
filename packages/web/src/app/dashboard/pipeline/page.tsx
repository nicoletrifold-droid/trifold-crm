import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { KanbanBoard, type InitialStageState } from "@web/components/pipeline/kanban-board"
import Link from "next/link"

const PAGE_SIZE = 50

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

function passesScoreFilter(score: number | null | undefined, filter: string | undefined): boolean {
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
        .in("role", ["broker", "gerente-comercial"])
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("campaigns")
        .select("id, name")
        .order("created_at", { ascending: false }),
    ])

  // Resolve campaign filter to lead id allowlist (preserves original logic).
  let campaignLeadIds: string[] | null = null
  if (filters.campaign_id) {
    const { data: entries } = await supabase
      .from("campaign_entries")
      .select("lead_id")
      .eq("campaign_id", filters.campaign_id)
      .not("lead_id", "is", null)

    campaignLeadIds = (entries ?? [])
      .map((e) => e.lead_id as string | null)
      .filter((id): id is string => Boolean(id))
  }

  const stagesList = stages ?? []

  // Promise.all: fetch top PAGE_SIZE leads per stage in parallel.
  const perStageResults = await Promise.all(
    stagesList.map(async (stage) => {
      let query = supabase
        .from("leads")
        .select(LEADS_SELECT, { count: "exact" })
        .eq("is_active", true)
        .eq("stage_id", stage.id)
        .is("lost_reason", null) // safeguard: leads marcados como perdidos não aparecem no kanban

      if (filters.property_id) {
        query = query.eq("property_interest_id", filters.property_id)
      }
      if (filters.broker_id === "none") {
        query = query.is("assigned_broker_id", null)
      } else if (filters.broker_id) {
        query = query.eq("assigned_broker_id", filters.broker_id)
      }
      if (filters.q) {
        const term = filters.q.trim()
        if (term) {
          const digitsOnly = term.replace(/\D/g, "")
          // Busca por nome OU por dígitos do telefone (se o termo contém números)
          if (digitsOnly.length >= 3) {
            query = query.or(`name.ilike.%${term}%,phone.ilike.%${digitsOnly}%`)
          } else {
            query = query.ilike("name", `%${term}%`)
          }
        }
      }
      if (campaignLeadIds !== null) {
        if (campaignLeadIds.length === 0) {
          // Force empty result while keeping a valid query shape.
          query = query.eq("id", "00000000-0000-0000-0000-000000000000")
        } else {
          query = query.in("id", campaignLeadIds)
        }
      }

      const { data, count } = await query
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)

      const rawLeads = (data ?? []) as RawLead[]
      // Score filter remains JS-side (parity with previous behaviour).
      const filtered = rawLeads.filter((l) =>
        passesScoreFilter(l.qualification_score as number | null | undefined, filters.score)
      )

      const totalCount = count ?? rawLeads.length
      const hasMore = totalCount > rawLeads.length

      return {
        stage_id: stage.id,
        leads: filtered.map(normalizeLead),
        totalCount,
        hasMore,
      }
    })
  )

  const initialLeadsPerStage = perStageResults as unknown as InitialStageState[]
  // Usa totalCount (contagem real do DB por stage) em vez de leads.length
  // (leads.length é limitado por PAGE_SIZE=50 e filtro de score client-side)
  const totalPipeline = initialLeadsPerStage.reduce((acc, s) => acc + s.totalCount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Pipeline</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">
          {totalPipeline} leads no pipeline
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <form key={JSON.stringify(filters)} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Buscar lead
            </label>
            <input
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Nome ou telefone..."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Empreendimento
            </label>
            <select
              name="property_id"
              defaultValue={filters.property_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
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
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Corretor
            </label>
            <select
              name="broker_id"
              defaultValue={filters.broker_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">Todos</option>
              <option value="none">Sem corretor</option>
              {brokers?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Campanha
            </label>
            <select
              name="campaign_id"
              defaultValue={filters.campaign_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
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
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Score
            </label>
            <select
              name="score"
              defaultValue={filters.score ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
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

        </form>

        <div className="mt-3 flex gap-2">
          {(filters.property_id || filters.broker_id || filters.score || filters.campaign_id || filters.q) && (
            <a
              href="/dashboard/pipeline"
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Limpar
            </a>
          )}

          <Link
            href="/dashboard/pipeline/config"
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Config follow-up
          </Link>
        </div>
      </div>

      <KanbanBoard
        initialStages={stagesList}
        initialLeadsPerStage={initialLeadsPerStage}
        activeFilters={{
          property_id: filters.property_id ?? null,
          broker_id: filters.broker_id ?? null,
          campaign_id: filters.campaign_id ?? null,
          score: filters.score ?? null,
        }}
      />
    </div>
  )
}
