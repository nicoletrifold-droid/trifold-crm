import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getServerUser } from "@web/lib/auth"
import { computeWaitingMinutes, AGUARDANDO_STAGE_ID } from "@web/lib/sla/waiting"
import Link from "next/link"
import { NewLeadModal } from "../_components/new-lead-modal"
import { LeadSearch } from "../_components/lead-search"
import { LeadFilters } from "@web/components/lead-filters"
import { LeadsListWithDrawer } from "./_components/leads-list-with-drawer"
import { LeadsSeenMarker } from "./_components/leads-seen-marker"
import { selectLatestMessageAt, type ConversationRef } from "@web/lib/broker/leads-window"
import { staleCutoffMs } from "@web/lib/broker/stale-cutoff"
import { TaskDateFilter } from "./_components/task-date-filter"
import { taskDateRange, taskDateLabel } from "@web/lib/broker/task-date-range"

const TASK_LABELS: Record<string, string> = {
  atrasadas: "Tarefas atrasadas",
  "para-hoje": "Tarefas para hoje",
  futuras: "Tarefas futuras",
  "sem-tarefas": "Sem tarefas",
}

const FILTER_LABELS: Record<string, string> = {
  trabalhados: "Leads já trabalhados",
}

export default async function BrokerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; property?: string; days?: string; tasks?: string; filter?: string; td?: string; tdfrom?: string; tdto?: string }>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const { q, stage, property, days, tasks, filter, td, tdfrom, tdto } = await searchParams
  const search = q?.trim().toLowerCase() ?? ""
  const tdRange = taskDateRange(td, tdfrom, tdto)

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const [{ data: leads }, { data: pendingTasks }, { data: properties }, { data: stages }] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          // Story 63-9 — embed de `conversations(last_message_at)` (LEFT JOIN único,
          // sem N+1) para o badge de janela de 24h na lista. Um lead pode ter várias
          // conversas; a mais recente é selecionada em JS via `selectLatestMessageAt`.
          `id, name, phone, email, qualification_score, interest_level,
           stage_id, property_interest_id, created_at, updated_at, primeiro_atendimento_em,
           kanban_stages:stage_id(name, color),
           properties:property_interest_id(name),
           conversations(last_message_at)`
        )
        .eq("assigned_broker_id", user.id)
        .eq("is_active", true)
        .is("lost_reason", null)
        .order("updated_at", { ascending: false }),

      // Tarefas pendentes — para filtro por status (tasks) e por data (td).
      // NÃO filtra por `assigned_to`: as tarefas criadas pelo corretor gravam
      // `assigned_to = NULL` (Story 75-42). O escopo do corretor já vem da interseção
      // com os leads dele (a lista só traz `assigned_broker_id = user.id`).
      tasks || td
        ? supabase
            .from("lead_tasks")
            .select("lead_id, due_at")
            .eq("org_id", user.orgId)
            .is("completed_at", null)
        : Promise.resolve({ data: [] as { lead_id: string; due_at: string | null }[], error: null }),

      supabase.from("properties").select("id, name").eq("is_active", true).order("name"),
      supabase.from("kanban_stages").select("id, name, color").eq("org_id", user.orgId).order("position"),
    ])

  // Story 75-49 — tempo (de expediente) aguardando atendimento, só p/ leads em
  // "Aguardando atendimento" ainda não atendidos. Distribuição → agora, via business-time.
  const aguardandoIds = (leads ?? [])
    .filter(
      (l) =>
        l.stage_id === AGUARDANDO_STAGE_ID &&
        !(l as { primeiro_atendimento_em?: string | null }).primeiro_atendimento_em
    )
    .map((l) => l.id)
  // Story 75-91: cálculo extraído p/ helper compartilhado (lib/sla/waiting), reusado no kanban do dashboard.
  const waitingByLead = await computeWaitingMinutes(createAdminClient(), user.orgId, aguardandoIds)

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

  // Leads com tarefa pendente vencendo no intervalo selecionado (filtro "Data da Tarefa")
  const taskDateLeadIds = (() => {
    if (!tdRange || !pendingTasks) return null
    const set = new Set<string>()
    for (const t of pendingTasks) {
      if (tdRange === "any") {
        set.add(t.lead_id) // Todo Período: qualquer tarefa pendente (com ou sem due_at)
        continue
      }
      if (!t.due_at) continue
      const d = new Date(t.due_at)
      if (d >= tdRange.from && d < tdRange.to) set.add(t.lead_id)
    }
    return set
  })()

  const daysCutoff = days ? staleCutoffMs(Number(days)) : 0
  const daysAgo = daysCutoff ? new Date(daysCutoff).toISOString() : null

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
    // Filtro "Data da Tarefa"
    if (taskDateLeadIds && !taskDateLeadIds.has(lead.id as string)) return false
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

  const tdLabel = taskDateLabel(td, tdfrom, tdto)

  // URL sem o filtro de tasks (para o botão ×)
  const clearTasksUrl = (() => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (stage) params.set("stage", stage)
    if (property) params.set("property", property)
    if (days) params.set("days", days)
    if (filter) params.set("filter", filter)
    if (td) params.set("td", td)
    if (tdfrom) params.set("tdfrom", tdfrom)
    if (tdto) params.set("tdto", tdto)
    const qs = params.toString()
    return `/broker/leads${qs ? `?${qs}` : ""}`
  })()

  // URL sem o filtro de data da tarefa (para o botão ×)
  const clearTaskDateUrl = (() => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (stage) params.set("stage", stage)
    if (property) params.set("property", property)
    if (days) params.set("days", days)
    if (tasks) params.set("tasks", tasks)
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
    if (td) params.set("td", td)
    if (tdfrom) params.set("tdfrom", tdfrom)
    if (tdto) params.set("tdto", tdto)
    const qs = params.toString()
    return `/broker/leads${qs ? `?${qs}` : ""}`
  })()

  return (
    <div className="space-y-4">
      {/* Story 75-8: zera o badge de novos leads ao abrir "Meus Leads". */}
      <LeadsSeenMarker />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meus Leads</h1>
          <p className="text-sm text-gray-500 dark:text-stone-500">
            {filtered.length}{(search || stage || tasks || filter || td) ? ` de ${leads?.length ?? 0}` : ""} leads
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

      <div className="flex flex-wrap items-center gap-2">
        <TaskDateFilter />
      </div>

      {/* Chip de filtro por tarefa ativo */}
      {(tasks && TASK_LABELS[tasks]) || (filter && FILTER_LABELS[filter]) || tdLabel ? (
        <div className="flex flex-wrap items-center gap-2">
          {tdLabel && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400">
              {tdLabel}
              <Link
                href={clearTaskDateUrl}
                className="ml-1 text-orange-400/60 hover:text-orange-300"
                aria-label="Remover filtro"
              >
                ×
              </Link>
            </span>
          )}
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
        <LeadsListWithDrawer
          leads={
            filtered.map((lead) => ({
              ...lead,
              // Story 63-9 — conversa mais recente do lead → estado da janela de 24h.
              last_message_at: selectLatestMessageAt(
                (lead as { conversations?: ConversationRef[] | null }).conversations
              ),
              // Story 75-49 — minutos aguardando atendimento (só leads em "Aguardando").
              waitingMinutes: waitingByLead[lead.id] ?? null,
            })) as Parameters<typeof LeadsListWithDrawer>[0]["leads"]
          }
          stages={(stages ?? []).map(s => ({ id: s.id, name: s.name, color: s.color }))}
          properties={(properties ?? []).map(p => ({ id: p.id, name: p.name }))}
        />
      )}
    </div>
  )
}
