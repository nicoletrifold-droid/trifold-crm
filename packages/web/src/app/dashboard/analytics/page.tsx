import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import { LeadsChart } from "@web/components/analytics/leads-chart"

export default async function AnalyticsPage() {
  await getServerUser()
  const supabase = await createClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [
    { count: totalLeads },
    { count: leadsToday },
    { count: leadsWeek },
    { count: leadsMonth },
    { data: stages },
    { data: properties },
    { data: brokers },
    { data: sourceLeads },
    { data: lostLeads },
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    supabase.from("kanban_stages").select("id, name, color, position, leads(id)").eq("is_active", true).order("position"),
    supabase.from("properties").select("id, name, leads:leads(id)").eq("is_active", true),
    supabase.from("users").select("id, name, leads:leads(id)").eq("role", "broker").eq("is_active", true),
    supabase.from("leads").select("source").eq("is_active", true).gte("created_at", monthStart.toISOString()),
    supabase.from("leads").select("lost_reason").not("lost_reason", "is", null),
  ])

  // Source counts
  const sourceCounts: Record<string, number> = {}
  const sourceLabels = SOURCE_LABELS_SHORT
  for (const l of sourceLeads ?? []) {
    const key = l.source ?? "other"
    sourceCounts[key] = (sourceCounts[key] ?? 0) + 1
  }

  // Lost reasons
  const lostReasons: Record<string, number> = {}
  for (const l of lostLeads ?? []) {
    const reason = l.lost_reason ?? "Não informado"
    lostReasons[reason] = (lostReasons[reason] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {/* Leads por Período — gráfico interativo com filtros (AC3-AC7) */}
      <LeadsChart properties={(properties ?? []).map((p) => ({ id: p.id, name: p.name }))} />

      {/* Period Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total de leads</p>
          <p className="mt-1 text-3xl font-bold">{totalLeads ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Hoje</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{leadsToday ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Esta semana</p>
          <p className="mt-1 text-3xl font-bold text-blue-600">{leadsWeek ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Este mês</p>
          <p className="mt-1 text-3xl font-bold text-orange-600">{leadsMonth ?? 0}</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Funil de Conversão</h2>
        <div className="space-y-2">
          {(stages ?? []).map((stage) => {
            const count = Array.isArray(stage.leads) ? stage.leads.length : 0
            const maxCount = Math.max(
              ...(stages ?? []).map((s) =>
                Array.isArray(s.leads) ? s.leads.length : 0
              ),
              1
            )
            return (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-600">{stage.name}</span>
                <div className="flex-1">
                  <div
                    className="h-6 rounded"
                    style={{
                      width: `${Math.max((count / maxCount) * 100, 2)}%`,
                      backgroundColor: stage.color,
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span className="w-10 text-right text-sm font-medium">{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By Property */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Leads por Empreendimento</h2>
          <div className="space-y-3">
            {(properties ?? []).map((p) => {
              const count = Array.isArray(p.leads) ? p.leads.length : 0
              return (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{p.name}</span>
                  <span className="rounded-full bg-orange-100 px-3 py-0.5 text-sm font-medium text-orange-700">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Source */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Leads por Origem (mês)</h2>
          <div className="space-y-3">
            {Object.entries(sourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {sourceLabels[source] ?? source}
                  </span>
                  <span className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-700">
                    {count}
                  </span>
                </div>
              ))}
            {Object.keys(sourceCounts).length === 0 && (
              <p className="text-sm text-gray-400">Nenhum lead este mês.</p>
            )}
          </div>
        </div>

        {/* Broker Performance */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Performance por Corretor</h2>
          <div className="space-y-3">
            {(brokers ?? []).map((broker) => {
              const leadCount = Array.isArray(broker.leads) ? broker.leads.length : 0
              return (
                <div key={broker.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{broker.name}</span>
                  <span className="text-sm font-medium text-gray-900">
                    {leadCount} leads
                  </span>
                </div>
              )
            })}
            {(!brokers || brokers.length === 0) && (
              <p className="text-sm text-gray-400">Nenhum corretor cadastrado.</p>
            )}
          </div>
        </div>

        {/* Lost Reasons */}
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Motivos de Perda</h2>
          <div className="space-y-3">
            {Object.entries(lostReasons)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{reason}</span>
                  <span className="rounded-full bg-red-100 px-3 py-0.5 text-sm font-medium text-red-700">
                    {count}
                  </span>
                </div>
              ))}
            {Object.keys(lostReasons).length === 0 && (
              <p className="text-sm text-gray-400">Nenhum lead perdido.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
