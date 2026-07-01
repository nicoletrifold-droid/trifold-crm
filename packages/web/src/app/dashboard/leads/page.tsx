import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { commercialDayRangeForOrg } from "@web/lib/metrics/commercial-day"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import { LeadFilters } from "@web/components/lead-filters"
import { LeadsBulkTable } from "@web/components/leads/leads-bulk-table"
import { PERDIDO_STAGE_IDS, EM_ATENDIMENTO_EXCLUDED_IDS } from "@web/lib/leads/stage-filters"
import { staleCutoffMs } from "@web/lib/broker/stale-cutoff"

const PAGE_SIZE = 50

function buildPageHref(
  targetPage: number,
  search?: string,
  stageId?: string,
  view?: string,
  propertyId?: string,
  days?: string,
  dateFrom?: string,
  dateTo?: string
): string {
  const p = new URLSearchParams()
  p.set("page", String(targetPage))
  if (search) p.set("search", search)
  if (stageId) p.set("stage_id", stageId)
  if (view) p.set("view", view)
  if (propertyId) p.set("property_id", propertyId)
  if (days) p.set("days", days)
  if (dateFrom) p.set("date_from", dateFrom)
  if (dateTo) p.set("date_to", dateTo)
  return `?${p.toString()}`
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; stage_id?: string; property_id?: string; days?: string; page?: string; view?: string; broker_id?: string; criados?: string; date_from?: string; date_to?: string }>
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
    .eq("segmento", "principal") // Story 75-98: tela principal não mostra o mundo IMOB
    .order("updated_at", { ascending: false })

  let countQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("segmento", "principal")

  // Filtro por view: ativos exclui stages de perdido, perdidos só inclui
  if (view === "perdidos") {
    const inList = `(${PERDIDO_STAGE_IDS.join(",")})`
    query = query.in("stage_id", PERDIDO_STAGE_IDS)
    countQuery = countQuery.in("stage_id", PERDIDO_STAGE_IDS)
    void inList
  } else {
    const excluded = `(${EM_ATENDIMENTO_EXCLUDED_IDS.join(",")})`
    query = query.not("stage_id", "in", excluded)
    countQuery = countQuery.not("stage_id", "in", excluded)
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

  if (params.property_id) {
    query = query.eq("property_interest_id", params.property_id)
    countQuery = countQuery.eq("property_interest_id", params.property_id)
  }

  if (params.broker_id) {
    query = query.eq("assigned_broker_id", params.broker_id)
    countQuery = countQuery.eq("assigned_broker_id", params.broker_id)
  }

  if (params.days) {
    const cutoff = staleCutoffMs(Number(params.days))
    if (cutoff) {
      const daysAgo = new Date(cutoff).toISOString()
      query = query.lt("updated_at", daysAgo)
      countQuery = countQuery.lt("updated_at", daysAgo)
    }
  }

  // "criados=hoje" — usa o DIA COMERCIAL (vira no fechamento, não meia-noite),
  // mesma fonte do card "Leads hoje" do dashboard (Story 75-57).
  if (params.criados === "hoje") {
    const { from } = await commercialDayRangeForOrg(user.orgId, supabase)
    const iso = from.toISOString()
    query = query.gte("created_at", iso)
    countQuery = countQuery.gte("created_at", iso)
  }

  // Story 75-94 — filtro de período de captura (created_at), fuso America/Sao_Paulo (UTC-3),
  // mesmo padrão do Pipeline. De inclui 00:00; Até inclui 23:59:59.
  if (params.date_from) {
    const from = `${params.date_from}T00:00:00-03:00`
    query = query.gte("created_at", from)
    countQuery = countQuery.gte("created_at", from)
  }
  if (params.date_to) {
    const to = `${params.date_to}T23:59:59-03:00`
    query = query.lte("created_at", to)
    countQuery = countQuery.lte("created_at", to)
  }

  query = query.range(offset, offset + PAGE_SIZE - 1)

  const [leadsResult, countResult, perdidosCountResult, stagesResult, propertiesResult, brokersResult] = await Promise.all([
    query,
    countQuery,
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .in("stage_id", PERDIDO_STAGE_IDS),
    supabase.from("kanban_stages").select("id, name, color").eq("org_id", user.orgId).order("position"),
    supabase.from("properties").select("id, name").eq("is_active", true).order("name"),
    supabase.from("users").select("id, name").eq("org_id", user.orgId).eq("is_active", true).in("role", ["broker", "gerente-comercial"]).order("name"),
  ])
  const leads = leadsResult.data
  const totalCount = countResult.count ?? 0
  const perdidosCount = perdidosCountResult.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const allStages = stagesResult.data ?? []
  const allProperties = propertiesResult.data ?? []
  const allBrokers = brokersResult.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Leads</h1>
        <Link
          href="/dashboard/leads/new"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Novo lead
        </Link>
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

      <div className="space-y-3">
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
        <LeadFilters
          stages={allStages.map(s => ({ id: s.id, name: s.name, color: s.color }))}
          properties={allProperties.map(p => ({ id: p.id, name: p.name }))}
          brokers={["admin", "supervisor", "gerente-comercial"].includes(user.role)
            ? allBrokers.map(b => ({ id: b.id, name: b.name }))
            : undefined}
          stageParam="stage_id"
          propertyParam="property_id"
          daysParam="days"
          brokerParam="broker_id"
          showDateRange
          dateFromParam="date_from"
          dateToParam="date_to"
        />
      </div>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <ScrollableX>
          <LeadsBulkTable
            leads={(leads ?? []).map((lead) => {
              type StageItem = { id: string; name: string; color: string | null }
              type PropItem = { id: string; name: string }
              type BrokerItem = { id: string; name: string }
              const stageRaw = lead.stage as unknown as StageItem[] | StageItem | null
              const propertyRaw = lead.property_interest as unknown as PropItem[] | PropItem | null
              const brokerRaw = lead.broker as unknown as BrokerItem[] | BrokerItem | null
              return {
                id: lead.id,
                name: lead.name ?? null,
                phone: lead.phone,
                qualification_score: lead.qualification_score ?? null,
                updated_at: lead.updated_at ?? null,
                source: (lead as unknown as Record<string, unknown>).source as string | null,
                stage: Array.isArray(stageRaw) ? stageRaw[0] ?? null : stageRaw ?? null,
                property_interest: Array.isArray(propertyRaw) ? propertyRaw[0] ?? null : propertyRaw ?? null,
                broker: Array.isArray(brokerRaw) ? brokerRaw[0] ?? null : brokerRaw ?? null,
              }
            })}
            brokers={allBrokers}
          />
        </ScrollableX>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-stone-800">
            {page > 1 ? (
              <Link
                href={buildPageHref(page - 1, params.search, params.stage_id, view === "perdidos" ? "perdidos" : undefined, params.property_id, params.days, params.date_from, params.date_to)}
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
                href={buildPageHref(page + 1, params.search, params.stage_id, view === "perdidos" ? "perdidos" : undefined, params.property_id, params.days, params.date_from, params.date_to)}
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
