import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { now } from "@web/lib/time"
import Link from "next/link"
import { NewAppointmentButton } from "./_components/new-appointment-modal"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function greeting() {
  const hour = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  })
  const h = parseInt(hour)
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

export default async function BrokerHomePage() {
  const user = await getServerUser()
  const supabase = await createClient()
  const nowIso = new Date(now()).toISOString()

  const [
    { data: allLeads },
    { data: stages },
    { data: upcomingAppointments },
    { data: pendingLogs },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, stage_id, kanban_stages:stage_id(name, color, position)")
      .eq("assigned_broker_id", user.id)
      .eq("is_active", true),

    supabase
      .from("kanban_stages")
      .select("id, name, color, position")
      .eq("org_id", user.orgId)
      .order("position"),

    supabase
      .from("appointments")
      .select(
        `id, scheduled_at, duration_minutes, location, status, client_name,
         lead:leads!lead_id(id, name, phone),
         property:properties!property_id(id, name)`
      )
      .eq("broker_id", user.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(5),

    supabase
      .from("follow_up_log")
      .select(
        `id, type, message, created_at,
         lead:leads!lead_id(id, name, phone, assigned_broker_id)`
      )
      .eq("org_id", user.orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  // Count leads per stage
  type StageSummary = { id: string; name: string; color: string; position: number; count: number }
  const stageMap = new Map<string, StageSummary>()
  for (const s of stages ?? []) {
    stageMap.set(s.id, { id: s.id, name: s.name, color: s.color, position: s.position, count: 0 })
  }
  for (const lead of allLeads ?? []) {
    if (lead.stage_id && stageMap.has(lead.stage_id)) {
      stageMap.get(lead.stage_id)!.count++
    }
  }
  const stageSummary = [...stageMap.values()]
    .filter((s) => s.count > 0)
    .sort((a, b) => a.position - b.position)

  // Filter pending logs to this broker's leads
  const myPendingLogs = (pendingLogs ?? [])
    .filter((log) => {
      const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
      return lead?.assigned_broker_id === user.id
    })
    .slice(0, 5)

  const totalLeads = allLeads?.length ?? 0
  const totalAppointments = upcomingAppointments?.length ?? 0
  const totalPending = myPendingLogs.length

  const logTypeLabel: Record<string, string> = {
    email: "E-mail",
    whatsapp: "WhatsApp",
    call: "Ligação",
    manual: "Manual",
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-orange-500">{greeting()},</p>
        <h1 className="mt-0.5 text-2xl font-bold text-stone-100">{user.name}</h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Link
          href="/broker/leads"
          className="group rounded-xl border border-stone-800 bg-stone-900 p-4 transition-colors hover:border-orange-500/40 hover:bg-stone-800/60"
        >
          <p className="text-2xl font-bold text-stone-100">{totalLeads}</p>
          <p className="mt-1 text-xs text-stone-500 group-hover:text-stone-400">Meus leads ativos</p>
        </Link>
        <Link
          href="/broker/agenda"
          className="group rounded-xl border border-stone-800 bg-stone-900 p-4 transition-colors hover:border-blue-500/40 hover:bg-stone-800/60"
        >
          <p className="text-2xl font-bold text-stone-100">{totalAppointments}</p>
          <p className="mt-1 text-xs text-stone-500 group-hover:text-stone-400">
            {totalAppointments === 1 ? "Próximo compromisso" : "Próximos compromissos"}
          </p>
        </Link>
        <Link
          href="/broker/alertas"
          className="group rounded-xl border border-stone-800 bg-stone-900 p-4 transition-colors hover:border-yellow-500/40 hover:bg-stone-800/60"
        >
          <p className={`text-2xl font-bold ${totalPending > 0 ? "text-yellow-400" : "text-stone-100"}`}>
            {totalPending}
          </p>
          <p className="mt-1 text-xs text-stone-500 group-hover:text-stone-400">Pendências de follow-up</p>
        </Link>
      </div>

      {/* Pipeline by stage */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
            Leads por etapa
          </h2>
          <Link href="/broker/pipeline" className="text-xs text-orange-500 hover:text-orange-400">
            Ver pipeline
          </Link>
        </div>
        {stageSummary.length === 0 ? (
          <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-8 text-center">
            <p className="text-sm text-stone-500">Nenhum lead atribuído ainda.</p>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stageSummary.map((stage) => (
              <Link
                key={stage.id}
                href={`/broker/leads?stage=${stage.id}`}
                className="group flex min-w-[100px] flex-col items-center gap-1 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3 transition-colors hover:border-stone-600"
              >
                <span
                  className="text-lg font-bold"
                  style={{ color: stage.color }}
                >
                  {stage.count}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-center text-[10px] font-medium"
                  style={{
                    backgroundColor: `${stage.color}20`,
                    color: stage.color,
                  }}
                >
                  {stage.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Two-column: Appointments + Follow-ups */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming appointments */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
              Próximos compromissos
            </h2>
            <div className="flex items-center gap-3">
              <NewAppointmentButton />
              <Link href="/broker/agenda" className="text-xs text-orange-500 hover:text-orange-400">
                Ver agenda
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-stone-800 bg-stone-900">
            {!upcomingAppointments || upcomingAppointments.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-stone-500">Nenhum compromisso agendado.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-800">
                {upcomingAppointments.map((appt) => {
                  const lead = Array.isArray(appt.lead) ? appt.lead[0] : appt.lead
                  const property = Array.isArray(appt.property) ? appt.property[0] : appt.property
                  const clientDisplay =
                    (lead as { name?: string | null } | null)?.name ||
                    appt.client_name ||
                    "Cliente não identificado"
                  return (
                    <li key={appt.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5 flex-shrink-0 text-center">
                        <p className="text-xs font-semibold text-blue-400">
                          {formatDate(appt.scheduled_at)}
                        </p>
                        <p className="text-base font-bold text-stone-100">
                          {formatTime(appt.scheduled_at)}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-200">{clientDisplay}</p>
                        <p className="truncate text-xs text-stone-500">
                          {appt.location ?? "Stand Trifold"}
                          {(property as { name?: string } | null)?.name
                            ? ` · ${(property as { name: string }).name}`
                            : ""}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400">
                        {appt.duration_minutes}min
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Pending follow-ups */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
              Pendências de follow-up
            </h2>
            <Link href="/broker/alertas" className="text-xs text-orange-500 hover:text-orange-400">
              Ver alertas
            </Link>
          </div>
          <div className="rounded-xl border border-stone-800 bg-stone-900">
            {myPendingLogs.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-stone-500">Nenhuma pendência. Tudo em dia!</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-800">
                {myPendingLogs.map((log) => {
                  const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
                  return (
                    <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 flex-shrink-0 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-400">
                        {logTypeLabel[log.type] ?? log.type}
                      </span>
                      <div className="min-w-0 flex-1">
                        {lead ? (
                          <Link
                            href={`/broker/leads/${(lead as { id: string }).id}`}
                            className="truncate text-sm font-medium text-stone-200 hover:text-orange-300"
                          >
                            {(lead as { name?: string | null }).name ||
                              (lead as { phone?: string | null }).phone ||
                              "Lead"}
                          </Link>
                        ) : (
                          <p className="truncate text-sm font-medium text-stone-200">Lead</p>
                        )}
                        {log.message && (
                          <p className="mt-0.5 truncate text-xs text-stone-500">{log.message}</p>
                        )}
                      </div>
                      <p className="flex-shrink-0 text-xs text-stone-600">
                        {new Date(log.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
