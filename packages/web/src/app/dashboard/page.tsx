import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

export default async function DashboardPage() {
  await getServerUser()
  const supabase = await createClient()

  // Fetch metrics in parallel
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(monday.getDate() - monday.getDay() + 1)


  const [leadsToday, pipeline, properties] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today.toISOString()),
    supabase
      .from("kanban_stages")
      .select("id, name, slug, color, position")
      .order("position"),
    supabase.from("properties").select("id, name, slug, status, total_units, city").eq("is_active", true),
  ])

  const stages = pipeline.data ?? []

  // Count leads per stage without transferring all IDs
  const stageCounts: Record<string, number> = {}
  await Promise.all(
    stages.map(async (s) => {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("stage_id", s.id)
        .eq("is_active", true)
      stageCounts[s.id] = count ?? 0
    })
  )

  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Leads hoje</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {leadsToday.count ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total no pipeline</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totalLeads}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Empreendimentos</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {properties.data?.length ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Unidades totais</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {properties.data?.reduce((a, p) => a + (p.total_units ?? 0), 0) ?? 0}
          </p>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Pipeline</h2>
        <div className="flex gap-2">
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
                <p className="mt-1 text-xl font-bold text-gray-900">{count}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Properties */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Empreendimentos</h2>
          <Link
            href="/dashboard/properties"
            className="text-sm text-orange-600 hover:text-orange-700"
          >
            Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {properties.data?.map((property) => (
            <Link
              key={property.id}
              href={`/dashboard/properties/${property.id}`}
              className="flex items-center justify-between rounded-md border p-4 hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">{property.name}</p>
                <p className="text-sm text-gray-500">
                  {property.city} &middot; {property.total_units} unidades
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
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
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
