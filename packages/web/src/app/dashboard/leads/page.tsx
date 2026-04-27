import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { SourceBadge } from "@web/components/ui/source-badge"

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; stage_id?: string }>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const params = await searchParams

  const isAdmin = user.role === "admin" || user.role === "supervisor"

  let query = supabase
    .from("leads")
    .select(
      `
      id, name, phone, email, qualification_score, interest_level, updated_at, source,
      stage:kanban_stages(id, name, color),
      property_interest:properties!property_interest_id(id, name),
      broker:users!assigned_broker_id(id, name)
    `
    )
    .eq("is_active", true)
    .order("updated_at", { ascending: false })

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,phone.ilike.%${params.search}%`
    )
  }

  if (params.stage_id) {
    query = query.eq("stage_id", params.stage_id)
  }

  const { data: leads } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        {isAdmin && (
          <Link
            href="/dashboard/leads/new"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Novo lead
          </Link>
        )}
      </div>

      <div>
        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="search"
            placeholder="Buscar por nome ou telefone..."
            defaultValue={params.search ?? ""}
            className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="rounded-lg bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Telefone</th>
              <th className="px-6 py-3">Empreendimento</th>
              <th className="px-6 py-3">Etapa</th>
              <th className="px-6 py-3">Origem</th>
              <th className="px-6 py-3">Corretor</th>
              <th className="px-6 py-3">Score</th>
              <th className="px-6 py-3">Último contato</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads?.map((lead) => {
              const stageArr = lead.stage as unknown as Array<{
                id: string
                name: string
                color: string | null
              }> | null
              const stage = stageArr?.[0] ?? null
              const propertyArr = lead.property_interest as unknown as Array<{
                id: string
                name: string
              }> | null
              const property = propertyArr?.[0] ?? null
              const brokerArr = lead.broker as unknown as Array<{
                id: string
                name: string
              }> | null
              const broker = brokerArr?.[0] ?? null

              return (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {lead.name || "Sem nome"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {lead.phone}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {property?.name ?? "-"}
                  </td>
                  <td className="px-6 py-4">
                    {stage ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: stage.color
                            ? `${stage.color}20`
                            : "#f3f4f6",
                          color: stage.color || "#374151",
                        }}
                      >
                        {stage.name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <SourceBadge source={(lead as unknown as Record<string, unknown>).source as string | null} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {broker?.name ?? "-"}
                  </td>
                  <td className="px-6 py-4">
                    {lead.qualification_score != null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          lead.qualification_score >= 70
                            ? "bg-green-100 text-green-700"
                            : lead.qualification_score >= 40
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {lead.qualification_score}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {lead.updated_at
                      ? new Date(lead.updated_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="text-sm text-orange-600 hover:text-orange-700"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              )
            })}
            {(!leads || leads.length === 0) && (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
                  Nenhum lead encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
