import { createClient } from "@web/lib/supabase/server"
import { propertyStatusBadge, propertyStatusLabel } from "@web/lib/property-status"
import { getServerUser } from "@web/lib/auth"
import { canEditImoveis, canCreateImoveis } from "@web/lib/permissions-imoveis"
import { can } from "@web/lib/permissions"
import Link from "next/link"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import { NicoleSwitch } from "./_components/nicole-switch"

export default async function PropertiesPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, slug, status, address, city, state, total_units, delivery_date, is_active, nicole_enabled")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  // Editar: admin/supervisor/obras. Criar: admin/supervisor (fonte única).
  const canEdit = await canEditImoveis(user.id, user.orgId)
  const canCreate = await canCreateImoveis(user.id, user.orgId)
  /**
   * Story 87-14 — a capability PRÓPRIA do switch, resolvida uma vez por request
   * (o `getUserPermissions` por trás de `can()` é cacheado por userId/orgId), não
   * por linha da tabela.
   *
   * 🔴 A chave literal importa: 29 das 103 capabilities do registro têm o mesmo
   * seed `[admin, supervisor]` — inclusive `imoveis.criar` e `imoveis.apagar`.
   * Qualquer uma delas compilaria e acertaria a tela HOJE, e a divergência só
   * apareceria no dia em que a matriz do painel mudasse para uma das duas, sem
   * deploy e sem aviso. É a mesma chave que a rota cobra (`route.ts:125`).
   */
  const podeAtivarNicole = await can(user.id, user.orgId, "imoveis.ativar_nicole")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Empreendimentos</h1>
        {canCreate && (
          <Link
            href="/dashboard/properties/new"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Novo empreendimento
          </Link>
        )}
      </div>

      <ScrollableX className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Status</th>
              {/* Story 87-13 — sem esta coluna, o estado do switch só é visível
                  abrindo empreendimento por empreendimento, e um controle que não
                  se vê é um controle que ninguém confere. */}
              <th className="px-6 py-3">Nicole</th>
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
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${propertyStatusBadge(p.status)}`}
                  >
                    {propertyStatusLabel(p.status)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {/* Story 87-14 — o CONTROLE vive aqui, não no fim do formulário
                      de edição. Para quem não tem `imoveis.ativar_nicole`, o
                      componente devolve exatamente o badge de leitura de antes. */}
                  <NicoleSwitch
                    propertyId={p.id}
                    nome={p.name}
                    nicoleEnabled={p.nicole_enabled === true}
                    podeAtivar={podeAtivarNicole}
                  />
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
                    {canEdit ? "Editar" : "Ver"}
                  </Link>
                </td>
              </tr>
            ))}
            {(!properties || properties.length === 0) && (
              <tr>
                <td
                  colSpan={7}
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
