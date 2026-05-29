import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

const typeBadgeStyles: Record<string, string> = {
  stage_change: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  handoff: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  lead_created: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  note_added: "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
}

const typeLabels: Record<string, string> = {
  stage_change: "Mudança de etapa",
  handoff: "Handoff",
  lead_created: "Lead criado",
  note_added: "Nota",
  broker_assigned: "Corretor atribuído",
}

export default async function AtividadesPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: activities } = await supabase
    .from("activities")
    .select(
      `
      id, type, description, metadata, created_at, lead_id, user_id,
      leads:lead_id(name, phone),
      users:user_id(name)
    `
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Atividades</h1>
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Data/Hora</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Descrição</th>
              <th className="px-6 py-3">Lead</th>
              <th className="px-6 py-3">Usuário</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {activities?.map((activity) => {
              const leadArr = activity.leads as unknown as Array<{
                name: string | null
                phone: string | null
              }> | null
              const lead = leadArr?.[0] ?? null

              const userArr = activity.users as unknown as Array<{
                name: string
              }> | null
              const activityUser = userArr?.[0] ?? null

              const badgeStyle =
                typeBadgeStyles[activity.type] ?? "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
              const typeLabel =
                typeLabels[activity.type] ?? activity.type

              return (
                <tr key={activity.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {activity.created_at
                      ? new Date(activity.created_at).toLocaleDateString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )
                      : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyle}`}
                    >
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-stone-300">
                    {activity.description ?? "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {activity.lead_id && lead?.name ? (
                      <Link
                        href={`/dashboard/leads/${activity.lead_id}`}
                        className="text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                      >
                        {lead.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400 dark:text-stone-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {activityUser?.name ?? "-"}
                  </td>
                </tr>
              )
            })}
            {(!activities || activities.length === 0) && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhuma atividade encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
