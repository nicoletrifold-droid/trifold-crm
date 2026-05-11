import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ObraVinculadaSection } from "./_components/obra-vinculada-section"

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ obra_created?: string; obra_error?: string }>
}) {
  const { id } = await params
  const { obra_created, obra_error } = await searchParams
  const appUser = await getServerUser()
  const supabase = await createClient()

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (!property) notFound()

  const [{ data: typologies }, { data: units }, { data: sales }, { data: obraVinculada }, { data: obrasDisponiveis }] = await Promise.all([
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
    supabase
      .from("unit_sales")
      .select("id, unit_id, client_name, sale_price, payment_method, sold_at, broker_id, units!inner(identifier, property_id)")
      .eq("units.property_id", id)
      .order("sold_at", { ascending: false })
      .limit(20),
    supabase
      .from("obras")
      .select("id, name, status, progress_pct")
      .eq("property_id", id)
      .eq("org_id", appUser.orgId)
      .maybeSingle(),
    supabase
      .from("obras")
      .select("id, name, status, progress_pct")
      .is("property_id", null)
      .eq("org_id", appUser.orgId)
      .order("created_at", { ascending: false }),
  ])

  const availableCount = units?.filter((u) => u.status === "available").length ?? 0
  const reservedCount = units?.filter((u) => u.status === "reserved").length ?? 0
  const soldCount = units?.filter((u) => u.status === "sold").length ?? 0

  const isAdminOrSupervisor = ["admin", "supervisor"].includes(appUser.role)

  const paymentMethodLabels: Record<string, string> = {
    financiamento_bancario: "Financiamento bancário",
    direto_construtora: "Direto construtora",
    a_vista: "À vista",
    misto: "Misto",
  }

  return (
    <div className="space-y-6">
      {obra_created === "true" && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          Obra criada ✓ — a obra de acompanhamento foi vinculada a este empreendimento.
        </div>
      )}
      {obra_error === "true" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Empreendimento criado, mas houve um erro ao criar a obra. Você pode vinculá-la manualmente na seção abaixo.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/properties"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Empreendimentos
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {property.name}
          </h1>
          <p className="text-sm text-gray-500">
            {property.address}, {property.city}/{property.state}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdminOrSupervisor && (
            <Link
              href={`/dashboard/properties/${id}/edit`}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Editar empreendimento
            </Link>
          )}
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              property.status === "selling"
                ? "bg-green-100 text-green-700"
                : property.status === "launching"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {property.status === "selling"
              ? "Em venda"
              : property.status === "launching"
              ? "Lançamento"
              : property.status}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold">{units?.length ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Disponíveis</p>
          <p className="text-2xl font-bold text-green-600">{availableCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Reservadas</p>
          <p className="text-2xl font-bold text-yellow-600">{reservedCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Vendidas</p>
          <p className="text-2xl font-bold text-blue-600">{soldCount}</p>
        </div>
      </div>

      {/* Concept & Details */}
      {property.concept && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Conceito</h2>
          <p className="text-gray-600">{property.concept}</p>
        </div>
      )}

      {/* Amenities */}
      {property.amenities && (property.amenities as string[]).length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Amenidades</h2>
          <div className="flex flex-wrap gap-2">
            {(property.amenities as string[]).map((a, i) => (
              <span
                key={i}
                className="rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Typologies */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Tipologias</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {typologies?.map((t) => (
            <div key={t.id} className="rounded-md border p-4">
              <p className="font-medium text-gray-900">{t.name}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                {t.private_area_m2 && <span>{t.private_area_m2}m2</span>}
                {t.bedrooms && <span>{t.bedrooms} quartos</span>}
                {t.suites && <span>{t.suites} suítes</span>}
                {t.has_balcony && <span>Sacada</span>}
                {t.balcony_bbq && <span>Churrasqueira</span>}
              </div>
              {t.description && (
                <p className="mt-2 text-sm text-gray-500">{t.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Units Table */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Unidades ({units?.length ?? 0})
          </h2>
          <Link
            href={`/dashboard/properties/${id}/units`}
            className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Gerenciar unidades
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2">Unidade</th>
                <th className="px-4 py-2">Andar</th>
                <th className="px-4 py-2">Posição</th>
                <th className="px-4 py-2">Vista</th>
                <th className="px-4 py-2">Área</th>
                <th className="px-4 py-2">Vagas</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units?.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/dashboard/properties/${id}/units/${u.id}`}
                      className="text-orange-600 hover:underline"
                    >
                      {u.identifier}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{u.floor}</td>
                  <td className="px-4 py-2">{u.position ?? "-"}</td>
                  <td className="px-4 py-2">{u.view_direction ?? "-"}</td>
                  <td className="px-4 py-2">
                    {u.private_area_m2 ? `${u.private_area_m2}m2` : "-"}
                  </td>
                  <td className="px-4 py-2">{u.garage_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === "available"
                          ? "bg-green-100 text-green-700"
                          : u.status === "reserved"
                          ? "bg-yellow-100 text-yellow-700"
                          : u.status === "sold"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
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
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/properties/${id}/units/${u.id}`}
                      className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-200"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Obra Vinculada */}
      {isAdminOrSupervisor && (
        <ObraVinculadaSection
          propertyId={id}
          obraVinculada={obraVinculada ?? null}
          obrasDisponiveis={obrasDisponiveis ?? []}
        />
      )}

      {/* Sales History */}
      {sales && sales.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">
            Vendas recentes ({sales.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2">Unidade</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Valor</th>
                  <th className="px-4 py-2">Pagamento</th>
                  <th className="px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map((s) => {
                  const unitInfo = s.units as unknown as { identifier: string }
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">
                        {unitInfo?.identifier ?? "-"}
                      </td>
                      <td className="px-4 py-2">{s.client_name ?? "-"}</td>
                      <td className="px-4 py-2">
                        {s.sale_price
                          ? `R$ ${Number(s.sale_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {s.payment_method
                          ? paymentMethodLabels[s.payment_method] ?? s.payment_method
                          : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {s.sold_at
                          ? new Date(s.sold_at).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
