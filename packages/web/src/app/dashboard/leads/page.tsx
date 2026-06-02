import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { SourceBadge } from "@web/components/ui/source-badge"
import { ScrollableX } from "@web/components/ui/scrollable-x"

const PAGE_SIZE = 50

function buildPageHref(
  targetPage: number,
  search?: string,
  stageId?: string,
  view?: string
): string {
  const p = new URLSearchParams()
  p.set("page", String(targetPage))
  if (search) p.set("search", search)
  if (stageId) p.set("stage_id", stageId)
  if (view) p.set("view", view)
  return `?${p.toString()}`
}

const PERDIDO_STAGE_IDS = [
  "00000000-0000-0000-0001-000000000008", // Represamento
  "95327bd7-3e88-4038-aa16-250a74ab085c", // Não Qualificado
]

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; stage_id?: string; page?: string; view?: string }>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const params = await searchParams

  // "Admin powers" intra-página (ex.: ações de gestão sobre leads):
  // capturado como acesso ao módulo "sistema" — somente admin tem por padrão.
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")

  const view = params.view === "perdidos" ? "perdidos" : "ativos"
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from("leads")
    .select(
      `
      id, name, phone, email, qualification_score, interest_level, updated_at, source, lost_reason,
      stage:kanban_stages(id, name, color),
      property_interest:properties!property_interest_id(id, name),
      broker:users!assigned_broker_id(id, name)
    `
    )
    .eq("is_active", true)
    .order("updated_at", { ascending: false })

  let countQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)

  // Filtro por view: ativos exclui stages de perdido, perdidos só inclui
  if (view === "perdidos") {
    const inList = `(${PERDIDO_STAGE_IDS.join(",")})`
    query = query.in("stage_id", PERDIDO_STAGE_IDS)
    countQuery = countQuery.in("stage_id", PERDIDO_STAGE_IDS)
    void inList
  } else {
    query = query.not("stage_id", "in", `(${PERDIDO_STAGE_IDS.join(",")})`)
    countQuery = countQuery.not("stage_id", "in", `(${PERDIDO_STAGE_IDS.join(",")})`)
  }

  if (params.search) {
    const orFilter = `name.ilike.%${params.search}%,phone.ilike.%${params.search}%`
    query = query.or(orFilter)
    countQuery = countQuery.or(orFilter)
  }

  if (params.stage_id) {
    query = query.eq("stage_id", params.stage_id)
    countQuery = countQuery.eq("stage_id", params.stage_id)
  }

  query = query.range(offset, offset + PAGE_SIZE - 1)

  const [leadsResult, countResult, perdidosCountResult] = await Promise.all([
    query,
    countQuery,
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .in("stage_id", PERDIDO_STAGE_IDS),
  ])
  const leads = leadsResult.data
  const totalCount = countResult.count ?? 0
  const perdidosCount = perdidosCountResult.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Leads</h1>
        {isAdmin && (
          <Link
            href="/dashboard/leads/new"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Novo lead
          </Link>
        )}
      </div>

      {/* Tabs Ativos / Perdidos */}
      <div className="flex gap-1 border-b border-stone-200 dark:border-stone-800">
        <Link
          href="/dashboard/leads"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            view === "ativos"
              ? "border-b-2 border-orange-500 text-orange-600 dark:text-orange-400"
              : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          }`}
        >
          Em atendimento
        </Link>
        <Link
          href="/dashboard/leads?view=perdidos"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            view === "perdidos"
              ? "border-b-2 border-red-500 text-red-600 dark:text-red-400"
              : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          }`}
        >
          Perdidos ({perdidosCount})
        </Link>
      </div>

      <div>
        <form method="get" className="flex gap-2">
          {view === "perdidos" && <input type="hidden" name="view" value="perdidos" />}
          <input
            type="text"
            name="search"
            placeholder="Buscar por nome ou telefone..."
            defaultValue={params.search ?? ""}
            className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:border-orange-400"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <ScrollableX>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
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
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
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
                <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                    {lead.name || "Sem nome"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {lead.phone}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
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
                      <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <SourceBadge source={(lead as unknown as Record<string, unknown>).source as string | null} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {broker?.name ?? "-"}
                  </td>
                  <td className="px-6 py-4">
                    {lead.qualification_score != null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          lead.qualification_score >= 70
                            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                            : lead.qualification_score >= 40
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                              : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                        }`}
                      >
                        {lead.qualification_score}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
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
                      className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
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
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhum lead encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </ScrollableX>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-stone-800">
            {page > 1 ? (
              <Link
                href={buildPageHref(page - 1, params.search, params.stage_id, view === "perdidos" ? "perdidos" : undefined)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-300 dark:border-stone-800 dark:text-stone-600"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-stone-400">
              Exibindo {leads?.length ?? 0} de {totalCount} leads — Página{" "}
              {page} de {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={buildPageHref(page + 1, params.search, params.stage_id, view === "perdidos" ? "perdidos" : undefined)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-300 dark:border-stone-800 dark:text-stone-600"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
