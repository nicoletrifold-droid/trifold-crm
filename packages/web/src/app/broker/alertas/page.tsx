import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { now } from "@web/lib/time"
import Link from "next/link"

export default async function BrokerAlertasPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  // Pending follow-up logs for this broker's leads
  const { data: pendingLogs } = await supabase
    .from("follow_up_log")
    .select(
      `id, type, status, message, created_at,
       lead:leads!lead_id(id, name, phone, stage_id, property_interest_id, assigned_broker_id, updated_at,
         stage:kanban_stages!stage_id(name),
         property:properties!property_interest_id(name)
       )`
    )
    .eq("org_id", user.orgId)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(100)

  // Stale leads assigned to this broker
  const nowMs = now()
  const twoDaysAgo = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: staleLeads } = await supabase
    .from("leads")
    .select(
      `id, name, phone, stage_id, property_interest_id, assigned_broker_id, updated_at,
       stage:kanban_stages!stage_id(name),
       property:properties!property_interest_id(name)`
    )
    .eq("org_id", user.orgId)
    .eq("assigned_broker_id", user.id)
    .eq("is_active", true)
    .lt("updated_at", twoDaysAgo)
    .order("updated_at", { ascending: true })
    .limit(50)

  type AlertItem = {
    id: string
    leadId: string
    leadName: string
    stageName: string
    daysSinceContact: number
    propertyName: string
    type: string
    source: "log" | "stale"
  }

  const alerts: AlertItem[] = []

  // From follow_up_log - filter to this broker's leads only
  if (pendingLogs) {
    for (const log of pendingLogs) {
      const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
      if (!lead) continue
      if (lead.assigned_broker_id !== user.id) continue

      const stage = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage
      const property = Array.isArray(lead.property) ? lead.property[0] : lead.property

      const daysSince = Math.floor(
        (nowMs - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      alerts.push({
        id: log.id,
        leadId: lead.id,
        leadName: lead.name || lead.phone || "Sem nome",
        stageName: (stage as { name?: string } | null)?.name || "-",
        daysSinceContact: daysSince,
        propertyName: (property as { name?: string } | null)?.name || "-",
        type: log.type,
        source: "log",
      })
    }
  }

  // Stale leads
  const logLeadIds = new Set(alerts.map((a) => a.leadId))
  if (staleLeads) {
    for (const lead of staleLeads) {
      if (logLeadIds.has(lead.id)) continue

      const stage = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage
      const property = Array.isArray(lead.property) ? lead.property[0] : lead.property

      const daysSince = Math.floor(
        (nowMs - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      alerts.push({
        id: `stale-${lead.id}`,
        leadId: lead.id,
        leadName: lead.name || lead.phone || "Sem nome",
        stageName: (stage as { name?: string } | null)?.name || "-",
        daysSinceContact: daysSince,
        propertyName: (property as { name?: string } | null)?.name || "-",
        type: "stale_lead",
        source: "stale",
      })
    }
  }

  alerts.sort((a, b) => b.daysSinceContact - a.daysSinceContact)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Meus Alertas</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Leads que precisam da sua atenção
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">Nenhum alerta pendente. Tudo em dia.</p>
        </div>
      ) : (
        <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
                <th className="px-6 py-3">Lead</th>
                <th className="px-6 py-3">Etapa</th>
                <th className="px-6 py-3">Dias sem contato</th>
                <th className="px-6 py-3">Empreendimento</th>
                <th className="px-6 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {alerts.map((alert) => {
                const urgencyClass =
                  alert.daysSinceContact > 4
                    ? "text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/15"
                    : alert.daysSinceContact > 2
                    ? "text-orange-600 bg-orange-50 dark:text-orange-300 dark:bg-orange-500/15"
                    : "text-gray-600 bg-gray-50 dark:text-stone-300 dark:bg-stone-800/50"

                return (
                  <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                      {alert.leadName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {alert.stageName}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${urgencyClass}`}
                      >
                        {alert.daysSinceContact}d
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {alert.propertyName}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {alert.source === "log" && (
                          <MarcarFeitoButton alertId={alert.id} />
                        )}
                        <Link
                          href={`/broker/leads/${alert.leadId}`}
                          className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/15"
                        >
                          Ver lead
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MarcarFeitoButton({ alertId }: { alertId: string }) {
  return (
    <form
      action={async () => {
        "use server"
        const supabase = await (
          await import("@web/lib/supabase/server")
        ).createClient()
        await supabase
          .from("follow_up_log")
          .update({ status: "done" })
          .eq("id", alertId)
      }}
    >
      <button
        type="submit"
        className="rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/20"
      >
        Marcar como feito
      </button>
    </form>
  )
}
