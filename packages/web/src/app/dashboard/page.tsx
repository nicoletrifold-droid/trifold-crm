import { createClient } from "@web/lib/supabase/server"
import { propertyStatusBadge, propertyStatusLabel } from "@web/lib/property-status"
import { getServerUser } from "@web/lib/auth"
import { EM_ATENDIMENTO_EXCLUDED_IDS } from "@web/lib/leads/stage-filters"
import { commercialDayRangeForOrg } from "@web/lib/metrics/commercial-day"
import Link from "next/link"
import { AlertCircle, Calendar, CheckCircle2, Filter, Users, UserX } from "lucide-react"

type StageCountRow = { stage_id: string; total: number | string }
type Counts = {
  total: number; novos: number; trabalhados: number
  sem_tarefas: number; atrasadas: number; para_hoje: number; futuras: number
}
type FunnelRow = {
  stage_id: string; stage_name: string; stage_slug: string; stage_color: string
  stage_position: number; total_leads: number
  leads_atrasadas: number; leads_para_hoje: number; leads_futuras: number
}

export default async function DashboardPage() {
  const appUser = await getServerUser()
  const supabase = await createClient()
  // Story 75-204: perfil sdr espelha o dashboard do gerente-comercial
  // (blocos "Leads da Equipe" + "Funil da Equipe", RPCs com p_broker_id null).
  const isGerenteComercial = ["gerente-comercial", "sdr"].includes(appUser.role)

  // Story 75-102: dashboard "espelho". Perfis do mundo IMOB (imob/consultoria) veem o
  // funil DELES (segmento='imob'); todos os demais seguem no mundo principal. Os links de
  // lead/pipeline apontam p/ as telas do mundo certo.
  const isImobWorld = appUser.role === "imob" || appUser.role === "consultoria"
  const segmento = isImobWorld ? "imob" : "principal"
  const leadsHref = isImobWorld ? "/dashboard/imob/leads" : "/dashboard/leads"
  const pipelineHref = isImobWorld ? "/dashboard/imob/pipeline" : "/dashboard/pipeline"

  // Fetch metrics in parallel
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(monday.getDate() - monday.getDay() + 1)

  // "Leads hoje" usa o DIA COMERCIAL (vira no fechamento, não meia-noite) — Story 75-57.
  const { from: commercialDayStart } = await commercialDayRangeForOrg(appUser.orgId, supabase)


  const [leadsToday, activeLeadsResult, pipeline, properties, stageTotalsResult, gerenteCountsResult, gerenteFunnelResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("segmento", segmento) // Story 75-98/75-102: mundo principal ou IMOB (espelho)
      .gte("created_at", commercialDayStart.toISOString()),
    // Leads ativos = MESMA regra da lista "Em atendimento" (fonte única)
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("segmento", segmento) // Story 75-98/75-102: mundo principal ou IMOB (espelho)
      .not("stage_id", "in", `(${EM_ATENDIMENTO_EXCLUDED_IDS.join(",")})`),
    supabase
      .from("kanban_stages")
      .select("id, name, slug, color, position")
      .eq("is_active", true)
      .order("position"),
    supabase.from("properties").select("id, name, slug, status, total_units, available_units, city").eq("is_active", true),
    supabase.rpc("get_dashboard_stage_counts", { p_org_id: appUser.orgId, p_segmento: segmento }),
    // Gerente-comercial: stats de toda a equipe
    isGerenteComercial
      ? supabase.rpc("get_broker_dashboard_counts", { p_org_id: appUser.orgId, p_broker_id: null })
      : Promise.resolve({ data: null, error: null }),
    isGerenteComercial
      ? supabase.rpc("get_broker_funnel_stats", { p_org_id: appUser.orgId, p_broker_id: null })
      : Promise.resolve({ data: null, error: null }),
  ])

  const stages = pipeline.data ?? []
  const activeStageIds = new Set(stages.map((s) => s.id))

  // Story 30.5: Stage counts via RPC (eliminates N+1: was 6+ round-trips, now 1)
  if (stageTotalsResult.error) {
    console.error("[DASHBOARD] Failed to load stage counts", stageTotalsResult.error)
    // Fallback: stageCounts vazio (UI mostra zeros — degradação graciosa)
  }

  const stageTotals = (stageTotalsResult.data ?? []) as StageCountRow[]
  const stageCounts: Record<string, number> = Object.fromEntries(
    stageTotals.map((r) => [r.stage_id, Number(r.total)])
  )

  const totalLeads = Object.entries(stageCounts)
    .filter(([id]) => activeStageIds.has(id))
    .reduce((a, [, b]) => a + b, 0)

  // Leads ativos = contagem direta com a MESMA regra da lista "Em atendimento"
  // (is_active=true + exclusão de perdidos/acervo). Fonte única → números batem.
  const activeLeads = activeLeadsResult.count ?? 0

  const gerenteCounts = (gerenteCountsResult.data ?? null) as Counts | null
  const gerenteFunnel = (gerenteFunnelResult.data ?? []) as FunnelRow[]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Dashboard</h1>

      {/* ── Visão da Equipe — Gerente Comercial ──────────────────── */}
      {isGerenteComercial && gerenteCounts && (
        <div className="space-y-5">
          {/* Leads da equipe */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-stone-200">Leads da Equipe</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-sm font-bold text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
                <Users className="h-3.5 w-3.5" />
                {gerenteCounts.total}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Novos\nDisponíveis", value: gerenteCounts.novos, color: "orange", icon: <Users className="h-5 w-5 text-orange-500" />, href: "/dashboard/leads" },
                { label: "Já\nTrabalhados", value: gerenteCounts.trabalhados, color: "neutral", icon: <Users className="h-5 w-5 text-gray-400 dark:text-stone-500" />, href: "/dashboard/leads" },
                { label: "Total\nSem Tarefas", value: gerenteCounts.sem_tarefas, color: "red", icon: <UserX className="h-5 w-5 text-red-500" />, href: "/dashboard/leads", alert: gerenteCounts.sem_tarefas > 0 },
                { label: "Tarefas\nAtrasadas", value: gerenteCounts.atrasadas, color: "red", icon: <AlertCircle className="h-5 w-5 text-red-500" />, href: "/dashboard/leads", alert: gerenteCounts.atrasadas > 0 },
                { label: "Tarefas\nPara Hoje", value: gerenteCounts.para_hoje, color: "amber", icon: <Calendar className="h-5 w-5 text-amber-500" />, href: "/dashboard/leads" },
                { label: "Tarefas\nFuturas", value: gerenteCounts.futuras, color: "emerald", icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, href: "/dashboard/leads" },
              ].map(({ label, value, color, icon, href, alert }) => (
                <Link
                  key={label}
                  href={href}
                  className={`flex flex-col rounded-xl border p-4 transition-all ${
                    alert
                      ? "border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15"
                      : "border-gray-200 bg-white hover:border-gray-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
                  }`}
                >
                  <div className="mb-2">{icon}</div>
                  <p className={`text-3xl font-bold ${
                    color === "orange" ? "text-orange-600 dark:text-orange-400"
                    : color === "red" ? "text-red-600 dark:text-red-400"
                    : color === "amber" ? "text-amber-600 dark:text-amber-400"
                    : color === "emerald" ? "text-emerald-600 dark:text-emerald-400"
                    : "text-gray-900 dark:text-stone-100"
                  }`}>{value}</p>
                  <p className="mt-1 whitespace-pre-line text-[11px] font-medium uppercase leading-tight text-gray-400 dark:text-stone-500">
                    {label}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {/* Funil da equipe */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-stone-200">Funil da Equipe</h2>
              <Link href="/dashboard/pipeline" className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300">
                Ver pipeline →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gerenteFunnel.map((stage) => (
                <Link
                  key={stage.stage_id}
                  href={`/dashboard/pipeline?stage=${stage.stage_slug}`}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
                >
                  <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: stage.stage_color }} />
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="mt-1 text-[11px] font-semibold uppercase leading-tight text-gray-400 dark:text-stone-500">{stage.stage_name}</p>
                    <Filter className="h-4 w-4 flex-shrink-0 text-gray-300 dark:text-stone-700" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-stone-100">{stage.total_leads}</p>
                  <div className="mt-3 flex gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${stage.leads_atrasadas > 0 ? "bg-red-500 text-white" : "bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-600"}`}>{stage.leads_atrasadas}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${stage.leads_para_hoje > 0 ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-600"}`}>{stage.leads_para_hoje}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${stage.leads_futuras > 0 ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-600"}`}>{stage.leads_futuras}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Link
          href={isImobWorld ? leadsHref : "/dashboard/leads?criados=hoje"}
          className="block rounded-lg bg-white p-5 shadow-sm transition hover:ring-2 hover:ring-orange-500/40 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
        >
          <p className="text-sm text-gray-500 dark:text-stone-400">Leads hoje</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">
            {leadsToday.count ?? 0}
          </p>
        </Link>
        <Link
          href={leadsHref}
          className="block rounded-lg bg-white p-5 shadow-sm transition hover:ring-2 hover:ring-orange-500/40 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
        >
          <p className="text-sm text-gray-500 dark:text-stone-400">Leads ativos</p>
          <p className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-400">{activeLeads}</p>
        </Link>
        <Link
          href={pipelineHref}
          className="block rounded-lg bg-white p-5 shadow-sm transition hover:ring-2 hover:ring-orange-500/40 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
        >
          <p className="text-sm text-gray-500 dark:text-stone-400">Total no pipeline</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">{totalLeads}</p>
        </Link>
        <Link
          href="/dashboard/properties"
          className="block rounded-lg bg-white p-5 shadow-sm transition hover:ring-2 hover:ring-orange-500/40 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
        >
          <p className="text-sm text-gray-500 dark:text-stone-400">Empreendimentos</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">
            {properties.data?.length ?? 0}
          </p>
        </Link>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Unidades disponíveis</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {properties.data?.reduce((a, p) => a + (p.available_units ?? 0), 0) ?? 0}
          </p>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">Pipeline</h2>
        <div className="overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {stages.map((stage) => {
            const count = stageCounts[stage.id] ?? 0
            return (
              <Link
                key={stage.id}
                href={isImobWorld ? pipelineHref : `/dashboard/pipeline?stage=${stage.slug}`}
                className="flex-1 rounded-md p-3 text-center transition-[filter] hover:brightness-125 cursor-pointer"
                style={{ backgroundColor: `${stage.color}15` }}
              >
                <p
                  className="text-xs font-medium"
                  style={{ color: stage.color }}
                >
                  {stage.name}
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-stone-100">{count}</p>
              </Link>
            )
          })}
        </div>
        </div>
      </div>

      {/* Properties */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Empreendimentos</h2>
          <Link
            href="/dashboard/properties"
            className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
          >
            Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {properties.data?.map((property) => {
            const soldPct =
              property.total_units && property.available_units != null
                ? Math.round(
                    ((property.total_units - property.available_units) / property.total_units) * 100
                  )
                : null
            return (
            <Link
              key={property.id}
              href={`/dashboard/properties/${property.id}`}
              className="rounded-md border p-4 hover:bg-gray-50 dark:border-stone-800 dark:hover:bg-stone-800/40"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-stone-100">{property.name}</p>
                  <p className="text-sm text-gray-500 dark:text-stone-400">
                    {property.city} &middot; {property.total_units} unidades
                    {property.available_units != null && (
                      <>
                        {" · "}
                        <span className="font-medium text-emerald-600 dark:text-emerald-300">
                          {property.available_units} disponíveis
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${propertyStatusBadge(property.status)}`}
                >
                  {propertyStatusLabel(property.status)}
                </span>
              </div>
              {soldPct != null && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-stone-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${soldPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums text-gray-400 dark:text-stone-500">
                    {soldPct}% vendido
                  </span>
                </div>
              )}
            </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
