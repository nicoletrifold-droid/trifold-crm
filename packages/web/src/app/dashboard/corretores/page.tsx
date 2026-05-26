import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { BrokerPropertyAssign } from "@web/components/admin/broker-property-assign"
import { ToggleAvailabilityButton } from "./_toggle-button"

export default async function CorretoresPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  // Ações administrativas em corretores (atribuir imóveis, etc.) — modeladas
  // como acesso ao módulo "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")

  // Get brokers with user info
  const { data: brokers } = await supabase
    .from("brokers")
    .select(
      `
      id, creci, type, is_available, max_leads, created_at,
      user:users!user_id(id, name, email, avatar_url, is_active)
    `
    )
    .eq("org_id", user.orgId)

  // Get properties for assignment
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  // Get broker assignments
  const { data: assignments } = await supabase
    .from("broker_assignments")
    .select("broker_id, property_id, is_primary, properties(name)")

  const assignmentsByBroker: Record<string, Array<{ property_id: string; property_name: string }>> = {}
  for (const a of assignments ?? []) {
    if (!assignmentsByBroker[a.broker_id]) assignmentsByBroker[a.broker_id] = []
    const prop = Array.isArray(a.properties) ? a.properties[0] : a.properties
    assignmentsByBroker[a.broker_id]!.push({
      property_id: a.property_id,
      property_name: (prop as { name: string } | null)?.name ?? "",
    })
  }

  // Get active lead counts per broker user
  const userIds = (brokers ?? [])
    .map((b) => {
      const u = b.user as unknown as { id: string } | null
      return u?.id
    })
    .filter(Boolean) as string[]

  let leadCounts: Record<string, number> = {}

  if (userIds.length > 0) {
    const { data: leads } = await supabase
      .from("leads")
      .select("assigned_broker_id")
      .eq("org_id", user.orgId)
      .eq("is_active", true)
      .in("assigned_broker_id", userIds)

    if (leads) {
      leadCounts = leads.reduce(
        (acc, lead) => {
          const brokerId = lead.assigned_broker_id as string
          acc[brokerId] = (acc[brokerId] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Corretores</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-stone-400">
            {brokers?.length ?? 0} corretores cadastrados
          </p>
          {isAdmin && (
            <Link
              href="/dashboard/corretores/novo"
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Novo Corretor
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="w-48 px-6 py-3">Nome</th>
              <th className="px-6 py-3">Email</th>
              <th className="w-24 px-6 py-3">CRECI</th>
              <th className="w-24 px-6 py-3">Tipo</th>
              <th className="w-28 px-6 py-3">Disponível</th>
              <th className="px-6 py-3">Empreendimentos</th>
              <th className="w-28 px-6 py-3">Leads ativos</th>
              {isAdmin && <th className="w-32 px-6 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {brokers?.map((broker) => {
              const brokerUser = broker.user as unknown as {
                id: string
                name: string
                email: string
                avatar_url: string | null
                is_active: boolean
              } | null

              const activeLeads = brokerUser
                ? leadCounts[brokerUser.id] || 0
                : 0

              const typeLabels: Record<string, string> = {
                internal: "Interno",
                external: "Externo",
                partner: "Parceiro",
              }

              return (
                <tr key={broker.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                    {brokerUser?.name ?? "Sem nome"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {brokerUser?.email ?? "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {broker.creci || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-stone-700/50 dark:text-stone-200">
                      {typeLabels[broker.type] ?? broker.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {broker.is_available ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                        Disponível
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        Indisponível
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {isAdmin ? (
                      <BrokerPropertyAssign
                        brokerId={broker.id}
                        properties={(properties ?? []).map(p => ({ id: p.id, name: p.name }))}
                        currentAssignments={(assignmentsByBroker[broker.id] ?? []).map(a => a.property_id)}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(assignmentsByBroker[broker.id] ?? []).map((a) => (
                          <span key={a.property_id} className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                            {a.property_name}
                          </span>
                        ))}
                        {!(assignmentsByBroker[broker.id]?.length) && (
                          <span className="text-xs text-stone-400 dark:text-stone-500">Nenhum</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {activeLeads} / {broker.max_leads ?? 50}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/corretores/${broker.id}`}
                          className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                        >
                          Editar
                        </Link>
                        <ToggleAvailabilityButton
                          brokerId={broker.id}
                          isAvailable={broker.is_available}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {(!brokers || brokers.length === 0) && (
              <tr>
                <td
                  colSpan={isAdmin ? 7 : 6}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhum corretor cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

