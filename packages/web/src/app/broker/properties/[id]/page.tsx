import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function BrokerPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await getServerUser()
  const supabase = await createClient()

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (!property) notFound()

  const [{ data: typologies }, { data: units }] = await Promise.all([
    supabase
      .from("typologies")
      .select("*")
      .eq("property_id", id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("units")
      .select("id, identifier, floor, position, view_direction, garage_count, private_area_m2, status, typology_id")
      .eq("property_id", id)
      .eq("is_active", true)
      .order("floor")
      .order("identifier"),
  ])

  const availableCount = units?.filter((u) => u.status === "available").length ?? 0
  const reservedCount = units?.filter((u) => u.status === "reserved").length ?? 0
  const soldCount = units?.filter((u) => u.status === "sold").length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/broker/properties"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            &larr; Empreendimentos
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
            {property.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-stone-400">
            {property.address}, {property.city}/{property.state}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            property.status === "selling"
              ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
              : property.status === "launching"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
              : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-300"
          }`}
        >
          {property.status === "selling"
            ? "Em venda"
            : property.status === "launching"
            ? "Lançamento"
            : property.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Total</p>
          <p className="text-2xl font-bold dark:text-stone-100">{units?.length ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Disponíveis</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{availableCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Reservadas</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{reservedCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Vendidas</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{soldCount}</p>
        </div>
      </div>

      {/* Conceito */}
      {property.concept && (
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-2 text-lg font-semibold dark:text-stone-100">Conceito</h2>
          <p className="text-gray-600 dark:text-stone-300">{property.concept}</p>
        </div>
      )}

      {/* Amenidades */}
      {property.amenities && (property.amenities as string[]).length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Amenidades</h2>
          <div className="flex flex-wrap gap-2">
            {(property.amenities as string[]).map((a, i) => (
              <span
                key={i}
                className="rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tipologias */}
      {typologies && typologies.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Tipologias</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {typologies.map((t) => (
              <div key={t.id} className="rounded-md border border-gray-200 p-4 dark:border-stone-700">
                <p className="font-medium text-gray-900 dark:text-stone-100">{t.name}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-stone-400">
                  {t.private_area_m2 && <span>{t.private_area_m2}m2</span>}
                  {t.bedrooms && <span>{t.bedrooms} quartos</span>}
                  {t.suites && <span>{t.suites} suítes</span>}
                  {t.has_balcony && <span>Sacada</span>}
                  {t.balcony_bbq && <span>Churrasqueira</span>}
                </div>
                {t.description && (
                  <p className="mt-2 text-sm text-gray-500 dark:text-stone-400">{t.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unidades (somente leitura) */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">
          Unidades ({units?.length ?? 0})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-stone-700">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-stone-400">
                <th className="px-4 py-2">Unidade</th>
                <th className="px-4 py-2">Andar</th>
                <th className="px-4 py-2">Posição</th>
                <th className="px-4 py-2">Vista</th>
                <th className="px-4 py-2">Área</th>
                <th className="px-4 py-2">Vagas</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {units?.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/50">
                  <td className="px-4 py-2 font-medium dark:text-stone-100">{u.identifier}</td>
                  <td className="px-4 py-2 dark:text-stone-300">{u.floor}</td>
                  <td className="px-4 py-2 dark:text-stone-300">{u.position ?? "-"}</td>
                  <td className="px-4 py-2 dark:text-stone-300">{u.view_direction ?? "-"}</td>
                  <td className="px-4 py-2 dark:text-stone-300">
                    {u.private_area_m2 ? `${u.private_area_m2}m2` : "-"}
                  </td>
                  <td className="px-4 py-2 dark:text-stone-300">{u.garage_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === "available"
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                          : u.status === "reserved"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                          : u.status === "sold"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                          : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-300"
                      }`}
                    >
                      {u.status === "available"
                        ? "Disponível"
                        : u.status === "reserved"
                        ? "Reservada"
                        : u.status === "sold"
                        ? "Vendida"
                        : u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
