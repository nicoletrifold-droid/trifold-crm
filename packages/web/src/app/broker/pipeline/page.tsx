import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import {
  KanbanBoard,
  type InitialStageState,
} from "@web/components/pipeline/kanban-board"
import { staleCutoffMs } from "@web/lib/broker/stale-cutoff"
// Story 50-5 (2026-07-09): CreativeChip habilitado também no pipeline do corretor —
// mesma miniatura do anúncio Meta que admin/supervisor já viam (meta_ads é por-org).
import { fetchCreativesForLeads, resolveCreativeForLead } from "@web/lib/pipeline/fetch-creatives"

const PAGE_SIZE = 50

// Story 50-2 (Epic 50): inclui `metadata` para resolver ad_id e attach creative server-side
const LEADS_SELECT = `id, name, phone, stage_id, qualification_score, interest_level, qualificacao_comercial,
         property_interest_id, assigned_broker_id, created_at, updated_at, last_contact_at,
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

export default async function BrokerPipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const user = await getServerUser()
  const supabase = await createClient()

  // Story 75-116 — filtro "dias sem contato" (last_contact_at, mesmo relógio do badge).
  const params = await searchParams
  const semContato = params.sem_contato ?? ""
  const semContatoCutoff = staleCutoffMs(parseInt(semContato, 10))
  const semContatoIso = semContatoCutoff > 0 ? new Date(semContatoCutoff).toISOString() : null

  const { data: stages } = await supabase
    .from("kanban_stages")
    .select("id, name, slug, color, position")
    .eq("is_active", true)
    .order("position")

  const stagesList = stages ?? []

  // Paginated per-stage load for the broker's own leads.
  const perStageResults = await Promise.all(
    stagesList.map(async (stage) => {
      let q = supabase
        .from("leads")
        .select(LEADS_SELECT, { count: "exact" })
        .eq("assigned_broker_id", user.id)
        .eq("is_active", true)
        .eq("stage_id", stage.id)
      if (semContatoIso) q = q.lt("last_contact_at", semContatoIso)
      const { data, count } = await q
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

  // Story 50-5: anexa o creative Meta a cada lead (mesmo padrão do /dashboard/pipeline).
  // Batched lookup (máx +1 query / AC7); degrada gracioso p/ SourceBadge se não achar.
  const allLeads = perStageResults.flatMap((s) => s.leads as RawLead[])
  const creativesMap = await fetchCreativesForLeads(supabase, allLeads, user.orgId)
  const initialLeadsPerStage = perStageResults.map((s) => ({
    ...s,
    leads: (s.leads as RawLead[]).map((l) => ({
      ...l,
      creative: resolveCreativeForLead(l, creativesMap),
    })),
  })) as unknown as InitialStageState[]
  const totalVisible = initialLeadsPerStage.reduce((acc, s) => acc + s.leads.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meu Pipeline</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">{totalVisible} leads</p>
      </div>

      {/* Story 75-116 — filtro "dias sem contato" */}
      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">Sem contato</label>
          <select
            name="sem_contato"
            defaultValue={semContato}
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          >
            <option value="">Qualquer</option>
            <option value="3">3+ dias</option>
            <option value="7">7+ dias</option>
            <option value="15">15+ dias</option>
            <option value="30">30+ dias</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700">
          Filtrar
        </button>
        {semContato && (
          <a href="/broker/pipeline" className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            Limpar
          </a>
        )}
      </form>

      {totalVisible === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            {semContato
              ? `Nenhum lead seu está sem contato há ${semContato}+ dias.`
              : "Você não tem leads designados. Novos leads serão atribuídos pelo supervisor."}
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
            sem_contato: semContato || null,
          }}
        />
      )}
    </div>
  )
}
