import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"

export default async function PropertiesPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, slug, status, address, city, state, total_units, delivery_date, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  // Ações administrativas (criar/editar imóveis) — modeladas como acesso
  // ao módulo "sistema" (somente admin tem por padrão).
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Empreendimentos</h1>
        {isAdmin && (
          <Link
            href="/dashboard/properties/new"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Novo empreendimento
          </Link>
        )}
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Cidade</th>
              <th className="px-6 py-3">Unidades</th>
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
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === "selling"
                        ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                        : p.status === "launching"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                        : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                    }`}
                  >
                    {p.status === "selling"
                      ? "Em venda"
                      : p.status === "launching"
                      ? "Lançamento"
                      : p.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {p.city}/{p.state}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {p.total_units ?? "-"}
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
                    href={`/dashboard/properties/${p.id}`}
                    className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    Editar
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
      </div>
    </div>
  )
}
