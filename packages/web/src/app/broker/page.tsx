import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { now } from "@web/lib/time"
import Link from "next/link"
import {
  Users, CalendarDays, Bell, ChevronRight, MapPin, Clock,
  AlertCircle, CheckCircle2, Calendar, UserX, Filter,
} from "lucide-react"
import { NewAppointmentButton } from "./_components/new-appointment-modal"

function greeting() {
  const h = parseInt(
    new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false,
    })
  )
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "numeric", month: "short",
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
  })
}

type Counts = {
  total: number; novos: number; trabalhados: number
  sem_tarefas: number; atrasadas: number; para_hoje: number; futuras: number
}

type FunnelRow = {
  stage_id: string; stage_name: string; stage_slug: string
  stage_color: string; stage_position: number; total_leads: number
  leads_atrasadas: number; leads_para_hoje: number; leads_futuras: number
}

export default async function BrokerHomePage() {
  const user = await getServerUser()
  const supabase = await createClient()
  const nowIso = new Date(now()).toISOString()

  const [
    countsResult,
    funnelResult,
    roletaConfigResult,
    brokerResult,
    upcomingAppointments,
    pendingLogs,
  ] = await Promise.all([
    supabase.rpc("get_broker_dashboard_counts", {
      p_org_id: user.orgId, p_broker_id: user.id,
    }),
    supabase.rpc("get_broker_funnel_stats", {
      p_org_id: user.orgId, p_broker_id: user.id,
    }),
    supabase.from("roleta_config").select("is_active").eq("org_id", user.orgId).maybeSingle(),
    supabase
      .from("brokers")
      .select("id, is_available, roleta_fila(position, is_active)")
      .eq("user_id", user.id)
      .eq("org_id", user.orgId)
      .maybeSingle(),
    supabase
      .from("appointments")
      .select(`id, scheduled_at, duration_minutes, location, status, client_name,
               lead:leads!lead_id(id, name, phone),
               property:properties!property_id(id, name)`)
      .eq("broker_id", user.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(5),
    supabase
      .from("follow_up_log")
      .select(`id, type, message, created_at, lead:leads!lead_id(id, name, phone, assigned_broker_id)`)
      .eq("org_id", user.orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const counts = (countsResult.data ?? {
    total: 0, novos: 0, trabalhados: 0, sem_tarefas: 0, atrasadas: 0, para_hoje: 0, futuras: 0,
  }) as Counts

  const funnel = (funnelResult.data ?? []) as FunnelRow[]

  const roletaAtiva = roletaConfigResult.data?.is_active ?? false
  const broker = brokerResult.data
  const roletaFila = broker?.roleta_fila
  const roletaEntry = Array.isArray(roletaFila) ? roletaFila[0] : roletaFila
  const isOnline = roletaEntry?.is_active ?? false
  const roletaPosition = roletaEntry?.position ?? null

  const myPendingLogs = ((pendingLogs.data ?? []) as Array<{
    id: string; type: string; message: string | null; created_at: string
    lead: { id: string; name: string | null; phone: string; assigned_broker_id: string | null } | null | Array<unknown>
  }>)
    .filter((log) => {
      const lead = Array.isArray(log.lead) ? log.lead[0] : log.lead
      return (lead as { assigned_broker_id?: string | null } | null)?.assigned_broker_id === user.id
    })
    .slice(0, 5)

  const logTypeLabel: Record<string, string> = {
    email: "E-mail", whatsapp: "WhatsApp", call: "Ligação", manual: "Manual",
  }

  return (
    <div className="space-y-6">

      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-orange-500">{greeting()},</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-100">{user.name}</h1>
        </div>
        <p className="text-xs text-stone-600">
          {new Date().toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long",
          })}
        </p>
      </div>

      {/* ── Roleta bar ───────────────────────────────────────────── */}
      {roletaAtiva && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          isOnline
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-red-500/30 bg-red-500/10"
        }`}>
          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          <p className="text-sm text-stone-300">
            <span className="font-semibold text-stone-100">ROLETA DE LEADS:</span>{" "}
            Você está{" "}
            <span className={`font-bold ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
            {isOnline && roletaPosition != null && (
              <span className="text-stone-400"> · {roletaPosition}ª posição na fila</span>
            )}
          </p>
        </div>
      )}

      {/* ── Meus Leads Ativos ────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-semibold text-stone-200">Meus Leads Ativos</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-orange-500/20 px-2.5 py-0.5 text-sm font-bold text-orange-400">
            <Users className="h-3.5 w-3.5" />
            {counts.total}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Novos leads */}
          <Link href="/broker/leads" className="group flex flex-col rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:border-orange-500/40 hover:bg-stone-800/80">
            <div className="mb-2 flex items-center justify-between">
              <Users className="h-5 w-5 text-orange-400" />
            </div>
            <p className="text-3xl font-bold text-orange-400">{counts.novos}</p>
            <p className="mt-1 text-[11px] font-medium uppercase leading-tight text-stone-500">
              Novos Leads<br /><span className="text-stone-400">Disponíveis</span>
            </p>
          </Link>

          {/* Trabalhados */}
          <Link href="/broker/leads" className="group flex flex-col rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:border-orange-500/40 hover:bg-stone-800/80">
            <div className="mb-2 flex items-center justify-between">
              <Users className="h-5 w-5 text-stone-500" />
            </div>
            <p className="text-3xl font-bold text-stone-100">{counts.trabalhados}</p>
            <p className="mt-1 text-[11px] font-medium uppercase leading-tight text-stone-500">
              Leads Já<br /><span className="text-stone-400">Trabalhados</span>
            </p>
          </Link>

          {/* Sem tarefas */}
          <Link href="/broker/leads" className={`group flex flex-col rounded-xl border p-4 transition-all ${
            counts.sem_tarefas > 0
              ? "border-red-500/30 bg-red-500/10 hover:bg-red-500/15"
              : "border-stone-800 bg-stone-900 hover:border-stone-700"
          }`}>
            <div className="mb-2">
              <UserX className={`h-5 w-5 ${counts.sem_tarefas > 0 ? "text-red-400" : "text-stone-600"}`} />
            </div>
            <p className={`text-3xl font-bold ${counts.sem_tarefas > 0 ? "text-red-400" : "text-stone-100"}`}>
              {counts.sem_tarefas}
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase leading-tight text-stone-500">
              Total Leads<br /><span className={counts.sem_tarefas > 0 ? "text-red-400" : "text-stone-400"}>Sem Tarefas</span>
            </p>
          </Link>

          {/* Atrasadas */}
          <Link href="/broker/leads" className={`group flex flex-col rounded-xl border p-4 transition-all ${
            counts.atrasadas > 0
              ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/15"
              : "border-stone-800 bg-stone-900 hover:border-stone-700"
          }`}>
            <div className="mb-2">
              <AlertCircle className={`h-5 w-5 ${counts.atrasadas > 0 ? "text-red-400" : "text-stone-600"}`} />
            </div>
            <p className={`text-3xl font-bold ${counts.atrasadas > 0 ? "text-red-400" : "text-stone-100"}`}>
              {counts.atrasadas}
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase leading-tight text-stone-500">
              Com Tarefas<br /><span className={counts.atrasadas > 0 ? "text-red-400" : "text-stone-400"}>Atrasadas</span>
            </p>
          </Link>

          {/* Para hoje */}
          <Link href="/broker/leads" className="group flex flex-col rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:border-amber-500/40 hover:bg-stone-800/80">
            <div className="mb-2">
              <Calendar className="h-5 w-5 text-amber-400" />
            </div>
            <p className="text-3xl font-bold text-amber-400">{counts.para_hoje}</p>
            <p className="mt-1 text-[11px] font-medium uppercase leading-tight text-stone-500">
              Com Tarefas<br /><span className="text-amber-400/80">Para Hoje</span>
            </p>
          </Link>

          {/* Futuras */}
          <Link href="/broker/leads" className="group flex flex-col rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:border-emerald-500/40 hover:bg-stone-800/80">
            <div className="mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-emerald-400">{counts.futuras}</p>
            <p className="mt-1 text-[11px] font-medium uppercase leading-tight text-stone-500">
              Com Tarefas<br /><span className="text-emerald-400/80">Futuras</span>
            </p>
          </Link>
        </div>
      </div>

      {/* ── Meu Funil de Vendas ──────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-200">Meu Funil de Vendas</h2>
          <Link href="/broker/pipeline" className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400">
            Ver pipeline <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {funnel.map((stage) => (
            <Link
              key={stage.stage_id}
              href={`/broker/leads?stage=${stage.stage_id}`}
              className="relative flex flex-col overflow-hidden rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:border-stone-700 hover:bg-stone-800/80"
            >
              {/* Color top bar */}
              <span
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ backgroundColor: stage.stage_color }}
              />

              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase leading-tight text-stone-500 mt-1">
                  {stage.stage_name}
                </p>
                <Filter className="h-4 w-4 flex-shrink-0 text-stone-700" />
              </div>

              <p className="text-3xl font-bold text-stone-100">{stage.total_leads}</p>

              {/* Task badges */}
              <div className="mt-3 flex gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  stage.leads_atrasadas > 0
                    ? "bg-red-500 text-white"
                    : "bg-stone-800 text-stone-600"
                }`}>
                  {stage.leads_atrasadas}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  stage.leads_para_hoje > 0
                    ? "bg-amber-500 text-white"
                    : "bg-stone-800 text-stone-600"
                }`}>
                  {stage.leads_para_hoje}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  stage.leads_futuras > 0
                    ? "bg-emerald-600 text-white"
                    : "bg-stone-800 text-stone-600"
                }`}>
                  {stage.leads_futuras}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Próximos compromissos + Follow-ups ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <div className="flex flex-col rounded-2xl border border-stone-800 bg-stone-900">
          <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-stone-300">Próximos compromissos</h2>
            <Link href="/broker/agenda" className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400">
              Ver agenda <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {!upcomingAppointments.data || upcomingAppointments.data.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
              <CalendarDays className="h-8 w-8 text-stone-700" />
              <p className="text-sm text-stone-600">Nenhum compromisso agendado.</p>
              <NewAppointmentButton />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-stone-800/70">
                {upcomingAppointments.data.map((appt) => {
                  const lead = Array.isArray(appt.lead) ? appt.lead[0] : appt.lead
                  const property = Array.isArray(appt.property) ? appt.property[0] : appt.property
                  const clientDisplay =
                    (lead as { name?: string | null } | null)?.name ||
                    appt.client_name || "Cliente não identificado"
                  return (
                    <li key={appt.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-14 flex-shrink-0 text-center">
                        <p className="text-xs font-medium text-blue-400">{formatDate(appt.scheduled_at)}</p>
                        <p className="text-sm font-bold text-stone-100">{formatTime(appt.scheduled_at)}</p>
                      </div>
                      <div className="h-8 w-px flex-shrink-0 bg-stone-800" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-200">{clientDisplay}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {appt.location ?? "Stand Trifold"}
                            {(property as { name?: string } | null)?.name ? ` · ${(property as { name: string }).name}` : ""}
                          </span>
                        </div>
                      </div>
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

        <div className="flex flex-col rounded-2xl border border-stone-800 bg-stone-900">
          <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-stone-300">Pendências de follow-up</h2>
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
                        <Link href={`/broker/leads/${(lead as { id: string }).id}`} className="block truncate text-sm font-medium text-stone-200 hover:text-orange-300">
                          {(lead as { name?: string | null }).name || (lead as { phone?: string | null }).phone || "Lead"}
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
