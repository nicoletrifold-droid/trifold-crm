import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { NewLeadModal } from "../_components/new-lead-modal"
import { LeadSearch } from "../_components/lead-search"

export default async function BrokerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string }>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const { q, stage } = await searchParams
  const search = q?.trim().toLowerCase() ?? ""

  const { data: leads } = await supabase
    .from("leads")
    .select(
      `id, name, phone, email, qualification_score, interest_level,
       stage_id, property_interest_id, created_at, updated_at,
       kanban_stages:stage_id(name, color),
       properties:property_interest_id(name)`
    )
    .eq("assigned_broker_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })

  // Filter client-side so search works across joined name/phone/email/stage
  const filtered = (leads ?? []).filter((lead) => {
    // Stage filter from URL param
    if (stage && lead.stage_id !== stage) return false
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

  // Load options for the new-lead modal
  const [{ data: properties }, { data: stages }] = await Promise.all([
    supabase.from("properties").select("id, name").eq("is_active", true).order("name"),
    supabase.from("kanban_stages").select("id, name, color").eq("org_id", user.orgId).order("position"),
  ])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Meus Leads</h1>
          <p className="text-sm text-stone-500">
            {filtered.length}{(search || stage) ? ` de ${leads?.length ?? 0}` : ""} leads
          </p>
        </div>
        <NewLeadModal
          properties={(properties ?? []).map(p => ({ id: p.id, name: p.name }))}
          stages={(stages ?? []).map(s => ({ id: s.id, name: s.name, color: s.color }))}
        />
      </div>

      {/* Search */}
      <LeadSearch />

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-stone-900 p-12 text-center ring-1 ring-stone-800">
          <p className="text-stone-500">
            {search
              ? `Nenhum lead encontrado para "${q}".`
              : "Você não tem leads designados. Novos leads serão atribuídos pelo supervisor."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="space-y-2 lg:hidden">
            {filtered.map((lead: Record<string, unknown>) => {
              const stageData = Array.isArray(lead.kanban_stages)
                ? lead.kanban_stages[0]
                : lead.kanban_stages
              const property = Array.isArray(lead.properties)
                ? lead.properties[0]
                : lead.properties
              return (
                <Link
                  key={lead.id as string}
                  href={`/broker/leads/${lead.id}`}
                  className="flex items-center gap-3 rounded-xl bg-stone-900 px-4 py-3.5 ring-1 ring-stone-800 active:bg-stone-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-stone-100">
                      {(lead.name as string) || (lead.phone as string)}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">{lead.phone as string}</p>
                    {(property as { name?: string } | null)?.name && (
                      <p className="mt-0.5 truncate text-xs text-stone-600">
                        {(property as { name: string }).name}
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

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl bg-stone-900 ring-1 ring-stone-800 lg:block">
            <table className="min-w-full divide-y divide-stone-800">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wider bg-stone-800/50 text-stone-400">
                  <th className="px-6 py-3">Lead</th>
                  <th className="px-6 py-3">Empreendimento</th>
                  <th className="px-6 py-3">Etapa</th>
                  <th className="px-6 py-3">Score</th>
                  <th className="px-6 py-3">Último contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800">
                {filtered.map((lead: Record<string, unknown>) => {
                  const stageData = Array.isArray(lead.kanban_stages)
                    ? lead.kanban_stages[0]
                    : lead.kanban_stages
                  const property = Array.isArray(lead.properties)
                    ? lead.properties[0]
                    : lead.properties
                  return (
                    <tr key={lead.id as string} className="hover:bg-stone-800/30">
                      <td className="px-6 py-4">
                        <Link
                          href={`/broker/leads/${lead.id}`}
                          className="font-medium text-stone-100 hover:text-orange-300"
                        >
                          {(lead.name as string) || (lead.phone as string)}
                        </Link>
                        <p className="text-xs text-stone-500">{lead.phone as string}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-400">
                        {(property as { name?: string } | null)?.name ?? "-"}
                      </td>
                      <td className="px-6 py-4">
                        {stageData && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${(stageData as { color: string }).color}20`,
                              color: (stageData as { color: string }).color,
                            }}
                          >
                            {(stageData as { name: string }).name}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {lead.qualification_score != null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              (lead.qualification_score as number) >= 70
                                ? "bg-green-500/15 text-green-300"
                                : (lead.qualification_score as number) >= 40
                                ? "bg-yellow-500/15 text-yellow-300"
                                : "bg-stone-700/50 text-stone-400"
                            }`}
                          >
                            {lead.qualification_score as number}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-400">
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
