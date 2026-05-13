import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { KanbanBoard } from "@web/components/pipeline/kanban-board"

export default async function BrokerPipelinePage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const [{ data: stages }, { data: leads }] = await Promise.all([
    supabase
      .from("kanban_stages")
      .select("id, name, slug, color, position")
      .eq("is_active", true)
      .order("position"),
    supabase
      .from("leads")
      .select(
        `id, name, phone, stage_id, qualification_score, interest_level,
         property_interest_id, assigned_broker_id, created_at, updated_at, source, utm_campaign,
         properties:property_interest_id(name)`
      )
      .eq("assigned_broker_id", user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false }),
  ])

  const mappedLeads = (leads ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    properties: Array.isArray(l.properties) ? l.properties[0] ?? null : l.properties ?? null,
    users: null,
  })) as Parameters<typeof KanbanBoard>[0]["initialLeads"]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meu Pipeline</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">
          {leads?.length ?? 0} leads
        </p>
      </div>

      {leads?.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            Você não tem leads designados. Novos leads serão atribuídos pelo
            supervisor.
          </p>
        </div>
      ) : (
        <KanbanBoard
          initialStages={stages ?? []}
          initialLeads={mappedLeads}
        />
      )}
    </div>
  )
}
