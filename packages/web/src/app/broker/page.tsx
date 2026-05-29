import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

export default async function BrokerHomePage() {
  const user = await getServerUser()
  const supabase = await createClient()

  // Get broker's leads
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meus Leads</h1>
        <p className="text-sm text-gray-500 dark:text-stone-400">
          {leads?.length ?? 0} leads designados
        </p>
      </div>

      {(!leads || leads.length === 0) ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            Você não tem leads designados. Novos leads serão atribuídos pelo
            supervisor.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
                <th className="px-6 py-3">Lead</th>
                <th className="px-6 py-3">Empreendimento</th>
                <th className="px-6 py-3">Etapa</th>
                <th className="px-6 py-3">Score</th>
                <th className="px-6 py-3">Último contato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {leads.map((lead: Record<string, unknown>) => {
                const stage = Array.isArray(lead.kanban_stages)
                  ? lead.kanban_stages[0]
                  : lead.kanban_stages
                const property = Array.isArray(lead.properties)
                  ? lead.properties[0]
                  : lead.properties
                return (
                  <tr key={lead.id as string} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                    <td className="px-6 py-4">
                      <Link
                        href={`/broker/leads/${lead.id}`}
                        className="font-medium text-gray-900 hover:text-orange-600 dark:text-stone-100 dark:hover:text-orange-300"
                      >
                        {(lead.name as string) || (lead.phone as string)}
                      </Link>
                      <p className="text-xs text-gray-500 dark:text-stone-400">{lead.phone as string}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {property?.name ?? "-"}
                    </td>
                    <td className="px-6 py-4">
                      {stage && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `${stage.color}20`,
                            color: stage.color,
                          }}
                        >
                          {stage.name}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {lead.qualification_score != null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            (lead.qualification_score as number) >= 70
                              ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                              : (lead.qualification_score as number) >= 40
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                              : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
                          }`}
                        >
                          {lead.qualification_score as number}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {new Date(lead.updated_at as string).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
