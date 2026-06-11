import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import {
  KanbanBoard,
  type InitialStageState,
} from "@web/components/pipeline/kanban-board"
// Story 50-2 + admin-only gate (pós-50-3): corretor não vê CreativeChip.
// fetchCreativesForLeads/resolveCreativeForLead removidos deste arquivo a propósito —
// LeadCard cai no fallback SourceBadge quando `creative` é ausente/null.

const PAGE_SIZE = 50

// Story 50-2 (Epic 50): inclui `metadata` para resolver ad_id e attach creative server-side
const LEADS_SELECT = `id, name, phone, stage_id, qualification_score, interest_level,
         property_interest_id, assigned_broker_id, created_at, updated_at,
         ai_summary, source, utm_campaign, utm_content, metadata,
         properties:property_interest_id(name)`

type RawLead = Record<string, unknown>

function normalizeLead(l: RawLead, brokerName: string) {
  return {
    ...l,
    properties: Array.isArray(l.properties)
      ? (l.properties[0] as { name: string } | undefined) ?? null
      : (l.properties as { name: string } | null) ?? null,
    // Todos os leads do pipeline do corretor são atribuídos a ele mesmo
    users: l.assigned_broker_id ? { name: brokerName } : null,
  }
}

export default async function BrokerPipelinePage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: stages } = await supabase
    .from("kanban_stages")
    .select("id, name, slug, color, position")
    .eq("is_active", true)
    .order("position")

  const stagesList = stages ?? []

  // Paginated per-stage load for the broker's own leads.
  const perStageResults = await Promise.all(
    stagesList.map(async (stage) => {
      const { data, count } = await supabase
        .from("leads")
        .select(LEADS_SELECT, { count: "exact" })
        .eq("assigned_broker_id", user.id)
        .eq("is_active", true)
        .eq("stage_id", stage.id)
        .order("updated_at", { ascending: false })
        .limit(PAGE_SIZE)

      const rawLeads = (data ?? []) as RawLead[]
      const totalCount = count ?? rawLeads.length
      const hasMore = totalCount > rawLeads.length

      return {
        stage_id: stage.id,
        leads: rawLeads.map((l) => normalizeLead(l, user.name)),
        totalCount,
        hasMore,
      }
    })
  )

  // Admin-only gate (pós-50-3): corretor sempre cai no fallback SourceBadge (creative ausente).
  const initialLeadsPerStage = perStageResults as unknown as InitialStageState[]
  const totalVisible = initialLeadsPerStage.reduce((acc, s) => acc + s.leads.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meu Pipeline</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">{totalVisible} leads</p>
      </div>

      {totalVisible === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            Você não tem leads designados. Novos leads serão atribuídos pelo
            supervisor.
          </p>
        </div>
      ) : (
        <KanbanBoard
          initialStages={stagesList}
          initialLeadsPerStage={initialLeadsPerStage}
          activeFilters={{
            property_id: null,
            broker_id: user.id,
            campaign_id: null,
            score: null,
          }}
        />
      )}
    </div>
  )
}
