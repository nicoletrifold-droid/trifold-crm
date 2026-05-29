import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

type StageCountRow = { stage_id: string; total: number | string }

export default async function DashboardPage() {
  const appUser = await getServerUser()
  const supabase = await createClient()

  // Fetch metrics in parallel
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(monday.getDate() - monday.getDay() + 1)


  const [leadsToday, pipeline, properties, stageTotalsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today.toISOString()),
    supabase
      .from("kanban_stages")
      .select("id, name, slug, color, position")
      .order("position"),
    supabase.from("properties").select("id, name, slug, status, total_units, available_units, city").eq("is_active", true),
    supabase.rpc("get_dashboard_stage_counts", { p_org_id: appUser.orgId }),
  ])

  const stages = pipeline.data ?? []

  // Story 30.5: Stage counts via RPC (eliminates N+1: was 6+ round-trips, now 1)
  if (stageTotalsResult.error) {
    console.error("[DASHBOARD] Failed to load stage counts", stageTotalsResult.error)
    // Fallback: stageCounts vazio (UI mostra zeros — degradação graciosa)
  }

  const stageTotals = (stageTotalsResult.data ?? []) as StageCountRow[]
  const stageCounts: Record<string, number> = Object.fromEntries(
    stageTotals.map((r) => [r.stage_id, Number(r.total)])
  )

  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Dashboard</h1>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Leads hoje</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">
            {leadsToday.count ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Total no pipeline</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">{totalLeads}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Empreendimentos</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">
            {properties.data?.length ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Unidades totais</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-stone-100">
            {properties.data?.reduce((a, p) => a + (p.total_units ?? 0), 0) ?? 0}
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
              <div
                key={stage.id}
                className="flex-1 rounded-md p-3 text-center"
                style={{ backgroundColor: `${stage.color}15` }}
              >
                <p
                  className="text-xs font-medium"
                  style={{ color: stage.color }}
                >
                  {stage.name}
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-stone-100">{count}</p>
              </div>
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
          {properties.data?.map((property) => (
            <Link
              key={property.id}
              href={`/dashboard/properties/${property.id}`}
              className="flex items-center justify-between rounded-md border p-4 hover:bg-gray-50 dark:border-stone-800 dark:hover:bg-stone-800/40"
            >
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
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  property.status === "selling"
                    ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                    : property.status === "launching"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                }`}
              >
                {property.status === "selling"
                  ? "Em venda"
                  : property.status === "launching"
                  ? "Lançamento"
                  : property.status}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
