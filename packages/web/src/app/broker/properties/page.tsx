import { createClient } from "@web/lib/supabase/server"
import { propertyStatusBadge, propertyStatusLabel } from "@web/lib/property-status"
import Link from "next/link"
import { ScrollableX } from "@web/components/ui/scrollable-x"

export default async function BrokerPropertiesPage() {
  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, status, city, state, total_units, available_units, delivery_date")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Empreendimentos</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Disponibilidade e detalhes dos empreendimentos.
        </p>
      </div>

      <ScrollableX className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Cidade</th>
              <th className="px-6 py-3">Disponíveis</th>
              <th className="px-6 py-3">Entrega</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {properties?.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                  {p.name}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${propertyStatusBadge(p.status)}`}
                  >
                    {propertyStatusLabel(p.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {p.city}/{p.state}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {p.available_units ?? "-"}
                  </span>
                  {p.total_units != null && (
                    <span className="text-gray-400 dark:text-stone-500"> / {p.total_units}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {p.delivery_date
                    ? new Date(p.delivery_date).toLocaleDateString("pt-BR", {
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/broker/properties/${p.id}`}
                    className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {(!properties || properties.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhum empreendimento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollableX>
    </div>
  )
}
