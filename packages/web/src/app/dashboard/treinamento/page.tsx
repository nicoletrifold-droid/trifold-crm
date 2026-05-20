import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function TreinamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const filters = await searchParams
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "treinamento"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  let query = supabase
    .from("knowledge_base")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (filters.source_id) {
    query = query.eq("source_id", filters.source_id)
  }

  const { data: entries } = await query

  const propertyMap = new Map(
    (properties ?? []).map((p) => [p.id, p.name])
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            Treinamento - Base de Conhecimento
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Gerencie o conhecimento da Nicole sobre os empreendimentos
          </p>
        </div>
      </div>

      {/* Filter + Add */}
      <div className="flex items-center justify-between">
        <form className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Empreendimento
            </label>
            <select
              name="source_id"
              defaultValue={filters.source_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">Todos</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Filtrar
          </button>
          {filters.source_id && (
            <Link
              href="/dashboard/treinamento"
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Limpar
            </Link>
          )}
        </form>

        <Link
          href="/dashboard/treinamento?action=add"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Adicionar
        </Link>
      </div>

      {/* Inline Add Form */}
      {filters.action === "add" && (
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Nova entrada</h2>
          <form method="POST" action="/api/knowledge-base" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
                  Titulo *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
                  Fonte
                </label>
                <input
                  type="text"
                  name="source"
                  placeholder="Ex: manual, site, regulamento"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
                Empreendimento
              </label>
              <select
                name="source_id"
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              >
                <option value="">Nenhum</option>
                {properties?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
                Conteudo *
              </label>
              <textarea
                name="content"
                required
                rows={5}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Salvar
              </button>
              <Link
                href="/dashboard/treinamento"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* Entries List */}
      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Titulo</th>
              <th className="px-6 py-3">Conteudo</th>
              <th className="px-6 py-3">Fonte</th>
              <th className="px-6 py-3">Empreendimento</th>
              <th className="px-6 py-3">Ativo</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {entries?.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                  {entry.title}
                </td>
                <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {entry.content?.substring(0, 80)}
                  {entry.content && entry.content.length > 80 ? "..." : ""}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {entry.source ?? "-"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {entry.source_id
                    ? propertyMap.get(entry.source_id) ?? "-"
                    : "-"}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      entry.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                        : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
                    }`}
                  >
                    {entry.is_active ? "Sim" : "Não"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/dashboard/treinamento?action=edit&id=${entry.id}`}
                      className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                    >
                      Editar
                    </Link>
                    <Link
                      href={`/dashboard/treinamento?action=delete&id=${entry.id}`}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200"
                    >
                      Excluir
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {(!entries || entries.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhuma entrada na base de conhecimento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
