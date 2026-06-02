import { createClient } from "@web/lib/supabase/server"
import { now } from "@web/lib/time"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { NewAppointmentButton } from "@web/app/dashboard/_components/new-appointment-modal"

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  scheduled: {
    label: "Agendado",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-500/15",
    border: "border-blue-200 dark:border-blue-500/30",
  },
  confirmed: {
    label: "Confirmado",
    color: "text-green-700 dark:text-green-300",
    bg: "bg-green-50 dark:bg-green-500/15",
    border: "border-green-200 dark:border-green-500/30",
  },
  completed: {
    label: "Realizado",
    color: "text-gray-500 dark:text-stone-400",
    bg: "bg-gray-50 dark:bg-stone-800/50",
    border: "border-gray-200 dark:border-stone-800",
  },
  cancelled: {
    label: "Cancelado",
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-500/15",
    border: "border-red-200 dark:border-red-500/30",
  },
  no_show: {
    label: "Ausente",
    color: "text-yellow-700 dark:text-yellow-300",
    bg: "bg-yellow-50 dark:bg-yellow-500/15",
    border: "border-yellow-200 dark:border-yellow-500/30",
  },
}

function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    days.push(d)
  }
  return days
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

interface Appointment {
  id: string
  scheduled_at: string
  duration_minutes: number
  location: string | null
  status: string
  notes: string | null
  lead: unknown
  broker: unknown
  property: unknown
}

interface RelatedLead {
  id: string
  name: string
  phone: string
}

interface RelatedBroker {
  id: string
  name: string
}

interface RelatedProperty {
  id: string
  name: string
}

function extractRelation<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null
  return (raw as T) ?? null
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    broker_id?: string
    week?: string
    date?: string
    view?: string
    apt?: string
    mark_completed?: string
  }>
}) {
  await getServerUser()
  const supabase = await createClient()
  const params = await searchParams
  const view = params.view ?? "week" // week, month, day

  // Handle mark_completed action
  if (params.mark_completed) {
    await supabase
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", params.mark_completed)
  }

  // Determine the current week
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nowMs = now()

  let weekStart: Date
  if (params.week) {
    weekStart = getMonday(new Date(params.week + "T00:00:00"))
  } else if (params.date) {
    weekStart = getMonday(new Date(params.date + "T00:00:00"))
  } else {
    weekStart = getMonday(today)
  }

  // For month view, get the full month range
  const selectedDate = params.date ? new Date(params.date + "T00:00:00") : today
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  // Query range depends on view
  const queryStart = view === "month" ? monthStart : view === "day" ? selectedDate : weekStart
  const queryEnd = view === "month" ? monthEnd : view === "day" ? new Date(selectedDate.getTime() + 86400000) : weekEnd

  const weekDays = getWeekDays(weekStart)

  // Navigation dates
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(weekStart.getDate() - 7)
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(weekStart.getDate() + 7)

  // Fetch brokers for filter
  const { data: brokers } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "broker")
    .order("name")

  // Fetch appointments for the week
  let query = supabase
    .from("appointments")
    .select(
      `
      id, scheduled_at, duration_minutes, location, status, notes,
      lead:leads!lead_id(id, name, phone),
      broker:users!broker_id(id, name),
      property:properties!property_id(id, name)
    `
    )
    .gte("scheduled_at", queryStart.toISOString())
    .lte("scheduled_at", queryEnd.toISOString())
    .order("scheduled_at", { ascending: true })

  if (params.broker_id) {
    query = query.eq("broker_id", params.broker_id)
  }

  const { data: rawAppointments } = await query
  const appointments = rawAppointments ?? []

  // Group appointments by day
  const appointmentsByDay: Record<string, Appointment[]> = {}
  for (const day of weekDays) {
    appointmentsByDay[formatDateISO(day)] = []
  }
  for (const apt of appointments) {
    const aptDate = new Date(apt.scheduled_at)
    const key = formatDateISO(aptDate)
    if (appointmentsByDay[key]) {
      appointmentsByDay[key].push(apt as Appointment)
    }
  }

  // Selected appointment details
  let selectedApt: Appointment | null = null
  if (params.apt && appointments) {
    selectedApt =
      (appointments.find((a) => a.id === params.apt) as Appointment) ?? null
  }

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]

  function buildUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {}
    if (params.broker_id) base.broker_id = params.broker_id
    if (params.week) base.week = params.week
    const merged = { ...base, ...overrides }
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&")
    return `/dashboard/agenda${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Agenda</h1>
          <NewAppointmentButton brokerId={params.broker_id} />
          {/* View toggle */}
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 dark:border-stone-800 dark:bg-stone-900">
            {(["day", "week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={`/dashboard/agenda?view=${v}&date=${formatDateISO(selectedDate)}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-orange-600 text-white"
                    : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                }`}
              >
                {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Broker filter */}
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="week" value={formatDateISO(weekStart)} />
            {params.apt && (
              <input type="hidden" name="apt" value={params.apt} />
            )}
            <select
              name="broker_id"
              defaultValue={params.broker_id ?? ""}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">Todos os corretores</option>
              {brokers?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              Filtrar
            </button>
          </form>
        </div>
      </div>

      {/* DAY VIEW */}
      {view === "day" && (
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={`/dashboard/agenda?view=day&date=${formatDateISO(new Date(selectedDate.getTime() - 86400000))}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
              className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              &larr; Dia anterior
            </Link>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              {selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h2>
            <Link
              href={`/dashboard/agenda?view=day&date=${formatDateISO(new Date(selectedDate.getTime() + 86400000))}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
              className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              Próximo dia &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            {appointments.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400 dark:text-stone-500">Nenhum agendamento neste dia</p>
            ) : (
              appointments.map((apt) => {
                const lead = extractRelation<RelatedLead>(apt.lead)
                const broker = extractRelation<RelatedBroker>(apt.broker)
                const property = extractRelation<RelatedProperty>(apt.property)
                const s = statusConfig[apt.status] ?? statusConfig.scheduled!
                const time = new Date(apt.scheduled_at)
                const isPastScheduled = apt.status === "scheduled" && time.getTime() < nowMs
                return (
                  <div key={apt.id} className={`rounded-lg border p-4 ${s.border} ${s.bg}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} —{" "}
                          {lead ? (
                            <Link href={`/dashboard/leads/${lead.id}`} className="text-orange-600 hover:underline dark:text-orange-300 dark:hover:text-orange-200">
                              {lead.name}
                            </Link>
                          ) : "Sem nome"}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {property?.name ?? ""} {broker ? `· ${broker.name}` : ""} · {apt.duration_minutes}min · {apt.location ?? "Stand Trifold"}
                        </p>
                        {apt.notes && <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{apt.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.bg} ${s.color}`}>{s.label}</span>
                        {apt.status === "completed" && lead && (
                          <Link
                            href={`/dashboard/leads/${lead.id}?tab=timeline`}
                            className="rounded-md bg-stone-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-stone-700"
                          >
                            Ver feedback
                          </Link>
                        )}
                        {isPastScheduled && (
                          <Link
                            href={`/dashboard/agenda?view=day&date=${formatDateISO(selectedDate)}&mark_completed=${apt.id}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
                            className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-orange-700"
                          >
                            Marcar como realizado
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* MONTH VIEW */}
      {view === "month" && (() => {
        const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
        const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)
        const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
        const totalDays = lastDay.getDate()
        const cells: (number | null)[] = Array(startDow).fill(null)
        for (let d = 1; d <= totalDays; d++) cells.push(d)
        while (cells.length % 7 !== 0) cells.push(null)

        const prevMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1)
        const nextMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1)

        return (
          <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <Link
                href={`/dashboard/agenda?view=month&date=${formatDateISO(prevMonth)}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
                className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                &larr;
              </Link>
              <h2 className="text-lg font-semibold capitalize text-stone-900">
                {selectedDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </h2>
              <Link
                href={`/dashboard/agenda?view=month&date=${formatDateISO(nextMonth)}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
                className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-px rounded-lg border border-stone-200 bg-stone-200 dark:border-stone-800 dark:bg-stone-800 min-w-[560px]">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d} className="bg-stone-50 px-2 py-1.5 text-center text-[11px] font-medium text-stone-500 dark:bg-stone-900 dark:text-stone-400">{d}</div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} className="min-h-[80px] bg-white dark:bg-stone-900" />
                const cellDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day)
                const dayAppts = appointments.filter((a) => isSameDay(new Date(a.scheduled_at), cellDate))
                const isToday = isSameDay(cellDate, today)
                return (
                  <Link
                    key={`day-${day}`}
                    href={`/dashboard/agenda?view=day&date=${formatDateISO(cellDate)}${params.broker_id ? `&broker_id=${params.broker_id}` : ""}`}
                    className={`min-h-[80px] bg-white p-1.5 hover:bg-orange-50 transition-colors dark:bg-stone-900 dark:hover:bg-stone-800/60 ${isToday ? "ring-2 ring-inset ring-orange-400" : ""}`}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-orange-600 dark:text-orange-300" : "text-stone-700 dark:text-stone-300"}`}>{day}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayAppts.slice(0, 3).map((apt) => {
                        const s = statusConfig[apt.status] ?? statusConfig.scheduled!
                        const lead = extractRelation<RelatedLead>(apt.lead)
                        return (
                          <div key={apt.id} className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${s.bg} ${s.color}`}>
                            {new Date(apt.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} {lead?.name ?? ""}
                          </div>
                        )
                      })}
                      {dayAppts.length > 3 && (
                        <span className="text-[9px] text-stone-400 dark:text-stone-500">+{dayAppts.length - 3} mais</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* WEEK VIEW */}
      {view === "week" && (<>
      {/* Week navigation */}
      <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <Link
          href={buildUrl({ week: formatDateISO(prevWeekStart), apt: undefined })}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          &larr; Anterior
        </Link>

        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-stone-100">
            {weekStart.getDate()} {monthNames[weekStart.getMonth()]} -{" "}
            {weekEnd.getDate()} {monthNames[weekEnd.getMonth()]}{" "}
            {weekEnd.getFullYear()}
          </p>
          {!isSameDay(weekStart, getMonday(today)) && (
            <Link
              href={buildUrl({
                week: formatDateISO(getMonday(today)),
                apt: undefined,
              })}
              className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
            >
              Ir para hoje
            </Link>
          )}
        </div>

        <Link
          href={buildUrl({ week: formatDateISO(nextWeekStart), apt: undefined })}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          Próximo &rarr;
        </Link>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-gray-200 shadow-sm dark:bg-stone-800 min-w-[560px]">
        {weekDays.map((day) => {
          const key = formatDateISO(day)
          const dayAppts = appointmentsByDay[key] ?? []
          const isToday = isSameDay(day, today)
          const isPast = day < today && !isToday

          return (
            <div
              key={key}
              className={`min-h-[180px] bg-white p-2 dark:bg-stone-900 ${
                isToday ? "ring-2 ring-inset ring-orange-400" : ""
              } ${isPast ? "bg-gray-50 dark:bg-stone-900/60" : ""}`}
            >
              {/* Day header */}
              <div className="mb-2 text-center">
                <p className="text-[10px] font-medium uppercase text-gray-400 dark:text-stone-500">
                  {dayNames[day.getDay()]}
                </p>
                <p
                  className={`text-lg font-bold ${
                    isToday
                      ? "mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white"
                      : "text-gray-800 dark:text-stone-200"
                  }`}
                >
                  {day.getDate()}
                </p>
              </div>

              {/* Appointments */}
              <div className="space-y-1">
                {dayAppts.map((apt) => {
                  const s = statusConfig[apt.status] ?? statusConfig.scheduled!
                  const time = new Date(apt.scheduled_at)
                  const lead = extractRelation<RelatedLead>(apt.lead)
                  const broker = extractRelation<RelatedBroker>(apt.broker)
                  const isSelected = params.apt === apt.id

                  return (
                    <Link
                      key={apt.id}
                      href={buildUrl({
                        apt: isSelected ? undefined : apt.id,
                      })}
                      className={`block rounded border px-1.5 py-1 text-[11px] leading-tight transition-all ${s.bg} ${s.border} ${s.color} ${
                        isSelected
                          ? "ring-2 ring-orange-400"
                          : "hover:brightness-95"
                      }`}
                    >
                      <p className="font-semibold">
                        {time.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Sao_Paulo",
                        })}
                      </p>
                      <p className="truncate">
                        {lead ? (
                          <Link href={`/dashboard/leads/${lead.id}`} className="hover:underline">
                            {lead.name}
                          </Link>
                        ) : "Lead"}
                      </p>
                      {broker && (
                        <p className="truncate text-[10px] opacity-75">
                          {broker.name}
                        </p>
                      )}
                    </Link>
                  )
                })}
                {dayAppts.length === 0 && (
                  <p className="text-center text-[10px] text-gray-300 dark:text-stone-600">-</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>

      </>)}

      {/* Appointment detail panel */}
      {selectedApt && (
        <AppointmentDetail
          apt={selectedApt}
          closeUrl={buildUrl({ apt: undefined })}
        />
      )}
    </div>
  )
}

function AppointmentDetail({
  apt,
  closeUrl,
}: {
  apt: Appointment
  closeUrl: string
}) {
  const s = statusConfig[apt.status] ?? statusConfig.scheduled!
  const date = new Date(apt.scheduled_at)
  const lead = extractRelation<RelatedLead>(apt.lead)
  const broker = extractRelation<RelatedBroker>(apt.broker)
  const property = extractRelation<RelatedProperty>(apt.property)

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">
          Detalhes do Agendamento
        </h2>
        <Link
          href={closeUrl}
          className="rounded-md px-3 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
        >
          Fechar
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">
            Data / Hora
          </p>
          <p className="text-sm text-gray-900 dark:text-stone-100">
            {date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às{" "}
            {date.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            })}
            <span className="ml-1 text-gray-400 dark:text-stone-500">
              ({apt.duration_minutes}min)
            </span>
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">Status</p>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.color}`}
          >
            {s.label}
          </span>
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">Lead</p>
          <p className="text-sm text-gray-900 dark:text-stone-100">
            {lead ? (
              <Link href={`/dashboard/leads/${lead.id}`} className="text-orange-600 hover:underline dark:text-orange-300 dark:hover:text-orange-200">{lead.name}</Link>
            ) : "-"}
          </p>
          {lead?.phone && (
            <p className="text-xs text-gray-500 dark:text-stone-400">{lead.phone}</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">
            Corretor
          </p>
          <p className="text-sm text-gray-900 dark:text-stone-100">{broker?.name ?? "-"}</p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">
            Empreendimento
          </p>
          <p className="text-sm text-gray-900 dark:text-stone-100">{property?.name ?? "-"}</p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">Local</p>
          <p className="text-sm text-gray-900 dark:text-stone-100">{apt.location ?? "-"}</p>
        </div>

        {apt.notes && (
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase text-gray-400 dark:text-stone-500">Notas</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-stone-300">
              {apt.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
