import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { now } from "@web/lib/time"
import Link from "next/link"
import { Users, CalendarDays, Bell, ChevronRight, MapPin, Clock } from "lucide-react"
import { NewAppointmentButton } from "./_components/new-appointment-modal"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
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
  const h = parseInt(
    new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    })
  )
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

  // Filter pending logs to this broker's leads only
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
    <div className="space-y-7">

      {/* ── Greeting ──────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-orange-500">{greeting()},</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-100">
            {user.name}
          </h1>
        </div>
        <p className="text-xs text-stone-600">
          {new Date().toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/broker/leads"
          className="group flex items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900 px-4 py-4 transition-all hover:border-orange-500/30 hover:bg-stone-900/80"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
            <Users className="h-4 w-4 text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-none text-stone-100">{totalLeads}</p>
            <p className="mt-1 truncate text-xs text-stone-500">Leads ativos</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0 text-stone-700 transition-colors group-hover:text-stone-500" />
        </Link>

        <Link
          href="/broker/agenda"
          className="group flex items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900 px-4 py-4 transition-all hover:border-blue-500/30 hover:bg-stone-900/80"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <CalendarDays className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-none text-stone-100">{totalAppointments}</p>
            <p className="mt-1 truncate text-xs text-stone-500">
              {totalAppointments === 1 ? "Compromisso" : "Compromissos"}
            </p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0 text-stone-700 transition-colors group-hover:text-stone-500" />
        </Link>

        <Link
          href="/broker/alertas"
          className="group flex items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900 px-4 py-4 transition-all hover:border-yellow-500/30 hover:bg-stone-900/80"
        >
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${totalPending > 0 ? "bg-yellow-500/15" : "bg-stone-800"}`}>
            <Bell className={`h-4 w-4 ${totalPending > 0 ? "text-yellow-400" : "text-stone-500"}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-xl font-bold leading-none ${totalPending > 0 ? "text-yellow-400" : "text-stone-100"}`}>
              {totalPending}
            </p>
            <p className="mt-1 truncate text-xs text-stone-500">Pendências</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0 text-stone-700 transition-colors group-hover:text-stone-500" />
        </Link>
      </div>

      {/* ── Pipeline by stage ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-300">Leads por etapa</h2>
          <Link
            href="/broker/pipeline"
            className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400"
          >
            Ver pipeline <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {stageSummary.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-600">Nenhum lead atribuído ainda.</p>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(stageSummary.length, 7)}, minmax(0, 1fr))` }}>
            {stageSummary.map((stage) => (
              <Link
                key={stage.id}
                href={`/broker/leads?stage=${stage.id}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-stone-800 bg-stone-950/60 py-3 transition-all hover:border-stone-700 hover:bg-stone-800/60"
              >
                <span className="text-2xl font-bold leading-none" style={{ color: stage.color }}>
                  {stage.count}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-center text-[10px] font-medium leading-tight"
                  style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                >
                  {stage.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Two columns ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Upcoming appointments */}
        <div className="flex flex-col rounded-2xl border border-stone-800 bg-stone-900">
          <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-stone-300">Próximos compromissos</h2>
            <Link
              href="/broker/agenda"
              className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400"
            >
              Ver agenda <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {!upcomingAppointments || upcomingAppointments.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
              <CalendarDays className="h-8 w-8 text-stone-700" />
              <p className="text-sm text-stone-600">Nenhum compromisso agendado.</p>
              <NewAppointmentButton />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-stone-800/70">
                {upcomingAppointments.map((appt) => {
                  const lead = Array.isArray(appt.lead) ? appt.lead[0] : appt.lead
                  const property = Array.isArray(appt.property) ? appt.property[0] : appt.property
                  const clientDisplay =
                    (lead as { name?: string | null } | null)?.name ||
                    appt.client_name ||
                    "Cliente não identificado"
                  return (
                    <li key={appt.id} className="flex items-center gap-4 px-5 py-3.5">
                      {/* Date/time column */}
                      <div className="w-14 flex-shrink-0 text-center">
                        <p className="text-xs font-medium text-blue-400">
                          {formatDate(appt.scheduled_at)}
                        </p>
                        <p className="text-sm font-bold text-stone-100">
                          {formatTime(appt.scheduled_at)}
                        </p>
                      </div>
                      {/* Divider */}
                      <div className="h-8 w-px flex-shrink-0 bg-stone-800" />
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-200">{clientDisplay}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {appt.location ?? "Stand Trifold"}
                            {(property as { name?: string } | null)?.name
                              ? ` · ${(property as { name: string }).name}`
                              : ""}
                          </span>
                        </div>
                      </div>
                      {/* Duration */}
                      <div className="flex-shrink-0 flex items-center gap-1 text-xs text-stone-500">
                        <Clock className="h-3 w-3" />
                        {appt.duration_minutes}min
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="border-t border-stone-800 px-5 py-3">
                <NewAppointmentButton />
              </div>
            </>
          )}
        </div>

        {/* Pending follow-ups */}
        <div className="flex flex-col rounded-2xl border border-stone-800 bg-stone-900">
          <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-stone-300">Pendências de follow-up</h2>
            <Link
              href="/broker/alertas"
              className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400"
            >
              Ver alertas <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {myPendingLogs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10">
              <Bell className="h-8 w-8 text-stone-700" />
              <p className="text-sm text-stone-600">Nenhuma pendência. Tudo em dia!</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-800/70">
              {myPendingLogs.map((log) => {
                const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
                return (
                  <li key={log.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex-shrink-0 rounded-lg bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-400">
                      {logTypeLabel[log.type] ?? log.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      {lead ? (
                        <Link
                          href={`/broker/leads/${(lead as { id: string }).id}`}
                          className="block truncate text-sm font-medium text-stone-200 hover:text-orange-300"
                        >
                          {(lead as { name?: string | null }).name ||
                            (lead as { phone?: string | null }).phone ||
                            "Lead"}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium text-stone-500">Lead removido</p>
                      )}
                      {log.message && (
                        <p className="mt-0.5 truncate text-xs text-stone-600">{log.message}</p>
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
  )
}
