import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { NewLeadModal } from "../_components/new-lead-modal"
import { LeadSearch } from "../_components/lead-search"
import { LeadFilters } from "@web/components/lead-filters"

const TASK_LABELS: Record<string, string> = {
  atrasadas: "Tarefas atrasadas",
  "para-hoje": "Tarefas para hoje",
  futuras: "Tarefas futuras",
  "sem-tarefas": "Sem tarefas",
}

const FILTER_LABELS: Record<string, string> = {
  trabalhados: "Leads já trabalhados",
}

const AGUARDANDO_STAGE_ID = "00000000-0000-0000-0001-000000000001"

export default async function BrokerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; property?: string; days?: string; tasks?: string; filter?: string }>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const { q, stage, property, days, tasks, filter } = await searchParams
  const search = q?.trim().toLowerCase() ?? ""

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const [{ data: leads }, { data: pendingTasks }, { data: properties }, { data: stages }] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          `id, name, phone, email, qualification_score, interest_level,
           stage_id, property_interest_id, created_at, updated_at,
           kanban_stages:stage_id(name, color),
           properties:property_interest_id(name)`
        )
        .eq("assigned_broker_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false }),

      // Tarefas pendentes do broker — para filtro por status
      tasks
        ? supabase
            .from("lead_tasks")
            .select("lead_id, due_at")
            .eq("org_id", user.orgId)
            .is("completed_at", null)
        : Promise.resolve({ data: [] as { lead_id: string; due_at: string | null }[], error: null }),

      supabase.from("properties").select("id, name").eq("is_active", true).order("name"),
      supabase.from("kanban_stages").select("id, name, color").eq("org_id", user.orgId).order("position"),
    ])

  // Build sets for task-based filtering
  const taskLeadIds = (() => {
    if (!tasks || !pendingTasks) return null
    const withOverdue = new Set<string>()
    const withToday = new Set<string>()
    const withFuture = new Set<string>()
    const withAnyTask = new Set<string>()
    for (const t of pendingTasks) {
      withAnyTask.add(t.lead_id)
      if (!t.due_at) continue
      const d = new Date(t.due_at)
      if (d < todayStart) withOverdue.add(t.lead_id)
      else if (d < tomorrowStart) withToday.add(t.lead_id)
      else withFuture.add(t.lead_id)
    }
    if (tasks === "atrasadas") return withOverdue
    if (tasks === "para-hoje") return withToday
    if (tasks === "futuras") return withFuture
    if (tasks === "sem-tarefas") return null // handled by exclusion
    return null
  })()

  const daysAgo = days ? new Date(Date.now() - Number(days) * 86400000).toISOString() : null

  const filtered = (leads ?? []).filter((lead) => {
    if (stage && lead.stage_id !== stage) return false
    if (property && lead.property_interest_id !== property) return false
    if (daysAgo && (lead.updated_at as string) >= daysAgo) return false
    if (filter === "trabalhados" && lead.stage_id === AGUARDANDO_STAGE_ID) return false
    // Task filters
    if (tasks === "sem-tarefas") {
      const hasTask = (pendingTasks ?? []).some((t) => t.lead_id === (lead.id as string))
      if (hasTask) return false
    } else if (taskLeadIds) {
      if (!taskLeadIds.has(lead.id as string)) return false
    }
    if (!search) return true
    const name = ((lead.name as string) ?? "").toLowerCase()
    const phone = ((lead.phone as string) ?? "").toLowerCase()
    const email = ((lead.email as string) ?? "").toLowerCase()
    const stageName = (() => {
      const s = Array.isArray(lead.kanban_stages) ? lead.kanban_stages[0] : lead.kanban_stages
      return ((s as { name?: string } | null)?.name ?? "").toLowerCase()
    })()
    return name.includes(search) || phone.includes(search) || email.includes(search) || stageName.includes(search)
  })

  // URL sem o filtro de tasks (para o botão ×)
  const clearTasksUrl = (() => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (stage) params.set("stage", stage)
    if (property) params.set("property", property)
    if (days) params.set("days", days)
    if (filter) params.set("filter", filter)
    const qs = params.toString()
    return `/broker/leads${qs ? `?${qs}` : ""}`
  })()

  // URL sem o filtro named (para o botão ×)
  const clearFilterUrl = (() => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (stage) params.set("stage", stage)
    if (property) params.set("property", property)
    if (days) params.set("days", days)
    if (tasks) params.set("tasks", tasks)
    const qs = params.toString()
    return `/broker/leads${qs ? `?${qs}` : ""}`
  })()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meus Leads</h1>
          <p className="text-sm text-gray-500 dark:text-stone-500">
            {filtered.length}{(search || stage || tasks || filter) ? ` de ${leads?.length ?? 0}` : ""} leads
          </p>
        </div>
        <NewLeadModal
          properties={(properties ?? []).map(p => ({ id: p.id, name: p.name }))}
          stages={(stages ?? []).map(s => ({ id: s.id, name: s.name, color: s.color }))}
        />
      </div>

      <LeadSearch />
      <LeadFilters
        stages={(stages ?? []).map(s => ({ id: s.id, name: s.name, color: s.color }))}
        properties={(properties ?? []).map(p => ({ id: p.id, name: p.name }))}
        stageParam="stage"
        propertyParam="property"
        daysParam="days"
      />

      {/* Chip de filtro por tarefa ativo */}
      {(tasks && TASK_LABELS[tasks]) || (filter && FILTER_LABELS[filter]) ? (
        <div className="flex flex-wrap items-center gap-2">
          {tasks && TASK_LABELS[tasks] && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400">
              {TASK_LABELS[tasks]}
              <Link
                href={clearTasksUrl}
                className="ml-1 text-orange-400/60 hover:text-orange-300"
                aria-label="Remover filtro"
              >
                ×
              </Link>
            </span>
          )}
          {filter && FILTER_LABELS[filter] && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400">
              {FILTER_LABELS[filter]}
              <Link
                href={clearFilterUrl}
                className="ml-1 text-orange-400/60 hover:text-orange-300"
                aria-label="Remover filtro"
              >
                ×
              </Link>
            </span>
          )}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800">
          <p className="text-stone-500">
            {search
              ? `Nenhum lead encontrado para "${q}".`
              : tasks
              ? `Nenhum lead com ${TASK_LABELS[tasks]?.toLowerCase()}.`
              : filter
              ? `Nenhum lead com filtro "${FILTER_LABELS[filter]?.toLowerCase()}".`
              : "Você não tem leads designados. Novos leads serão atribuídos pelo supervisor."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="space-y-2 lg:hidden">
            {filtered.map((lead: Record<string, unknown>) => {
              const stageData = Array.isArray(lead.kanban_stages) ? lead.kanban_stages[0] : lead.kanban_stages
              const propertyData = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
              return (
                <Link
                  key={lead.id as string}
                  href={`/broker/leads/${lead.id}`}
                  className="flex items-center gap-3 rounded-xl bg-white px-4 py-3.5 ring-1 ring-gray-200 active:bg-gray-50 dark:bg-stone-900 dark:ring-stone-800 dark:active:bg-stone-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900 dark:text-stone-100">
                      {(lead.name as string) || (lead.phone as string)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-500">{lead.phone as string}</p>
                    {(propertyData as { name?: string } | null)?.name && (
                      <p className="mt-0.5 truncate text-xs text-stone-600">
                        {(propertyData as { name: string }).name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {stageData && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: `${(stageData as { color: string }).color}20`,
                          color: (stageData as { color: string }).color,
                        }}
                      >
                        {(stageData as { name: string }).name}
                      </span>
                    )}
                    <p className="text-[11px] text-stone-600">
                      {new Date(lead.updated_at as string).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800 lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-stone-800 dark:text-stone-500">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Empreendimento</th>
                  <th className="px-4 py-3">Etapa</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Último contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-stone-800/60">
                {filtered.map((lead: Record<string, unknown>) => {
                  const stageData = Array.isArray(lead.kanban_stages) ? lead.kanban_stages[0] : lead.kanban_stages
                  const propertyData = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
                  const score = lead.qualification_score as number | null
                  return (
                    <tr key={lead.id as string} className="transition-colors hover:bg-gray-50 dark:hover:bg-stone-800/40">
                      <td className="px-4 py-3">
                        <Link href={`/broker/leads/${lead.id}`} className="block">
                          <p className="font-medium text-gray-900 dark:text-stone-100">
                            {(lead.name as string) || (lead.phone as string)}
                          </p>
                          <p className="text-xs text-stone-500">{lead.phone as string}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-stone-400">
                        {(propertyData as { name?: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {stageData ? (
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${(stageData as { color: string }).color}20`,
                              color: (stageData as { color: string }).color,
                            }}
                          >
                            {(stageData as { name: string }).name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {score != null ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            score >= 70
                              ? "bg-green-500/20 text-green-400"
                              : score >= 40
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-gray-200 text-gray-600 dark:bg-stone-700 dark:text-stone-400"
                          }`}>
                            {score}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-stone-500">
                        {new Date(lead.updated_at as string).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
