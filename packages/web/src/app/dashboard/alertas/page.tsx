import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { now } from "@web/lib/time"
import { redirect } from "next/navigation"

import { AlertasSeenMarker } from "./_components/alertas-seen-marker"
import { AlertasTable, type AlertItem } from "./_components/alertas-table"

export default async function AlertasPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "alertas"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  // Pending follow-up logs
  const { data: pendingLogs } = await supabase
    .from("follow_up_log")
    .select(
      `id, type, status, message, created_at,
       lead:leads!lead_id(id, name, phone, source, stage_id, property_interest_id, assigned_broker_id, updated_at, last_contact_at,
         stage:kanban_stages!stage_id(name),
         property:properties!property_interest_id(name),
         broker:users!assigned_broker_id(name)
       )`
    )
    .eq("org_id", user.orgId)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(100)

  // Story 75-110: leads sem contato há > 2 dias — usa last_contact_at (último contato real),
  // não updated_at (que não muda ao registrar contato).
  const nowMs = now()
  const twoDaysAgo = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: staleLeads } = await supabase
    .from("leads")
    .select(
      `id, name, phone, source, stage_id, property_interest_id, assigned_broker_id, updated_at, last_contact_at,
       stage:kanban_stages!stage_id(name),
       property:properties!property_interest_id(name),
       broker:users!assigned_broker_id(name)`
    )
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .lt("last_contact_at", twoDaysAgo)
    .order("last_contact_at", { ascending: true })
    .limit(50)

  const alerts: AlertItem[] = []

  // From follow_up_log
  if (pendingLogs) {
    for (const log of pendingLogs) {
      const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
      if (!lead) continue

      const stage = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage
      const property = Array.isArray(lead.property) ? lead.property[0] : lead.property
      const broker = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker

      const daysSince = Math.floor(
        (nowMs - new Date((lead as { last_contact_at?: string | null }).last_contact_at ?? lead.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      alerts.push({
        id: log.id,
        leadId: lead.id,
        leadName: lead.name || lead.phone || "Sem nome",
        stageName: (stage as { name?: string } | null)?.name || "-",
        daysSinceContact: daysSince,
        propertyName: (property as { name?: string } | null)?.name || "-",
        brokerName: (broker as { name?: string } | null)?.name || "Sem corretor",
        sourceName: (lead as { source?: string }).source || "",
        type: log.type,
        source: "log",
      })
    }
  }

  // From stale leads (avoid duplicates)
  const logLeadIds = new Set(alerts.map((a) => a.leadId))
  if (staleLeads) {
    for (const lead of staleLeads) {
      if (logLeadIds.has(lead.id)) continue

      const stage = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage
      const property = Array.isArray(lead.property) ? lead.property[0] : lead.property
      const broker = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker

      const daysSince = Math.floor(
        (nowMs - new Date((lead as { last_contact_at?: string | null }).last_contact_at ?? lead.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      alerts.push({
        id: `stale-${lead.id}`,
        leadId: lead.id,
        leadName: lead.name || lead.phone || "Sem nome",
        stageName: (stage as { name?: string } | null)?.name || "-",
        daysSinceContact: daysSince,
        propertyName: (property as { name?: string } | null)?.name || "-",
        brokerName: (broker as { name?: string } | null)?.name || "Sem corretor",
        sourceName: (lead as { source?: string }).source || "",
        type: "stale_lead",
        source: "stale",
      })
    }
  }

  // Sort by urgency (most days first) — default for initial render
  alerts.sort((a, b) => b.daysSinceContact - a.daysSinceContact)

  return (
    <div className="space-y-6">
      <AlertasSeenMarker />
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Alertas</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Leads que precisam de atenção - sem contato recente
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">Nenhum alerta pendente. Tudo em dia.</p>
        </div>
      ) : (
        <AlertasTable alerts={alerts} />
      )}
    </div>
  )
}
