import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { SOURCE_LABELS } from "@web/lib/constants"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MessageText } from "@web/components/ui/message-text"

interface Chip {
  from: string | null
  to: string
  kind: "stage" | "broker" | "pool"
}

interface TimelineEvent {
  type: string
  actor: "lead" | "nicole" | "broker" | "system"
  /** Rótulo específico do ator: "João Silva" · "Nicole (IA)" · "Sistema · Roleta". */
  actorLabel: string
  title: string
  description: string
  timestamp: string
  chips: Chip | null
  isMessage: boolean
  metadata: Record<string, unknown>
}

interface TimelineData {
  events: TimelineEvent[]
  summary: {
    total_days: number
    total_messages: number
    total_events: number
    lead_created_at: string
  }
}

const actorColors: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  lead: { dot: "bg-gray-400 dark:bg-stone-500", bg: "bg-gray-50 dark:bg-stone-800/50", text: "text-gray-700 dark:text-stone-300", label: "Lead" },
  nicole: { dot: "bg-orange-500", bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-700 dark:text-orange-300", label: "Nicole" },
  broker: { dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-700 dark:text-blue-300", label: "Corretor" },
  system: { dot: "bg-green-500", bg: "bg-green-50 dark:bg-green-500/10", text: "text-green-700 dark:text-green-300", label: "Sistema" },
}

// Dicionário único de eventos: rótulo amigável + ícone por tipo de activity.
const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: "Lead criado",
  stage_change: "Mudança de etapa",
  broker_assigned: "Corretor atribuído",
  handoff: "Handoff para corretor",
  transfer: "Transferência de corretor",
  broker_note: "Nota",
  note_added: "Nota",
  lead_lost: "Lead perdido",
  lead: "Lead perdido",
  lead_reactivated: "Lead reativado",
  qualification_updated: "Qualificação atualizada",
  appointment_created: "Agendamento criado",
  appointment_updated: "Agendamento remarcado",
  appointment_cancelled: "Agendamento cancelado",
  appointment_completed: "Agendamento concluído",
  visit_completed: "Visita concluída",
  post_visit: "Pós-visita",
  followup_post_visit: "Pós-visita",
  nicole_sent: "Follow-up automático",
  followup_nicole_sent: "Follow-up automático",
  alert_broker: "Alerta de follow-up",
  followup_alert_broker: "Alerta de follow-up",
  appointment_no_show: "Não compareceu",
  ai_resumed: "IA reativada",
  supremo_contact: "Contato importado",
  unit_sold: "Unidade vendida",
  bolsao_in: "Entrou no bolsão",
  stale_lead: "Lead parado",
  meta_webhook_received: "Evento Meta recebido",
  form_completed: "Formulário preenchido",
  lead_source_updated: "Origem atualizada",
}

const ACTIVITY_ICONS: Record<string, string> = {
  lead_created: "🆕",
  stage_change: "📊",
  broker_assigned: "🎯",
  handoff: "🤝",
  transfer: "🔀",
  broker_note: "📝",
  note_added: "📝",
  lead_lost: "❌",
  lead: "❌",
  lead_reactivated: "♻️",
  qualification_updated: "📈",
  appointment_created: "📅",
  appointment_updated: "📅",
  appointment_cancelled: "🚫",
  appointment_completed: "✅",
  visit_completed: "✅",
  post_visit: "🔔",
  followup_post_visit: "🔔",
  nicole_sent: "🤖",
  followup_nicole_sent: "🤖",
  alert_broker: "🔔",
  followup_alert_broker: "🔔",
  appointment_no_show: "⚠️",
  ai_resumed: "✨",
  supremo_contact: "📇",
  unit_sold: "🏠",
  bolsao_in: "📥",
  stale_lead: "😴",
  meta_webhook_received: "📣",
  form_completed: "🧾",
  lead_source_updated: "🔁",
}

// Ator quando user_id é NULL (ação automatizada): sub-rótulo por tipo.
const SYSTEM_SUBLABEL: Record<string, string> = {
  broker_assigned: "Roleta",
  bolsao_in: "Bolsão",
  followup_alert_broker: "Follow-up",
  alert_broker: "Follow-up",
  appointment_no_show: "Agenda",
  supremo_contact: "Sienge",
  meta_webhook_received: "Meta",
  stale_lead: "SLA",
}

// Eventos que, sem usuário humano, são atribuídos à Nicole (IA).
const IA_TYPES = new Set(["nicole_sent", "followup_nicole_sent"])

const messageIcons: Record<string, string> = {
  message_lead: "💬",
  message_nicole: "🤖",
  message_broker: "👤",
  message_system: "⚙️",
}

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "lead", label: "Lead" },
  { key: "nicole", label: "Nicole" },
  { key: "broker", label: "Equipe" },
  { key: "system", label: "Sistema" },
] as const

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { id } = await params
  const filters = await searchParams
  await getServerUser()
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from("leads")
    .select(
      `id, name, phone, qualification_score,
       stage:kanban_stages(name, color)`
    )
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    notFound()
  }

  const stageArr = lead.stage as unknown as Array<{ name: string; color: string | null }> | null
  const stage = stageArr?.[0] ?? null

  const timelineData = await fetchTimelineData(supabase, id)

  const activeFilter = filters.filter || "all"
  const filteredEvents =
    activeFilter === "all"
      ? timelineData.events
      : timelineData.events.filter((e) => e.actor === activeFilter)

  // Mensagens são colapsadas por padrão só na visão "Todos" (para não afogar os
  // eventos de decisão). Ao filtrar por um ator específico, mostra tudo aberto.
  const collapseMessages = activeFilter === "all"

  // Agrupa itens para renderização: runs de mensagens viram um bloco colapsável.
  type RenderItem =
    | { kind: "event"; event: TimelineEvent }
    | { kind: "messages"; events: TimelineEvent[] }
  const renderItems: RenderItem[] = []
  for (const ev of filteredEvents) {
    if (collapseMessages && ev.isMessage) {
      const last = renderItems[renderItems.length - 1]
      if (last && last.kind === "messages") last.events.push(ev)
      else renderItems.push({ kind: "messages", events: [ev] })
    } else {
      renderItems.push({ kind: "event", event: ev })
    }
  }

  const itemTimestamp = (item: RenderItem) =>
    item.kind === "event" ? item.event.timestamp : item.events[0]!.timestamp

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/leads/${id}`}
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        &larr; Voltar para lead
      </Link>

      {/* Summary Card */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
              Histórico — {lead.name || "Sem nome"}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">{lead.phone}</p>
          </div>
          {stage && (
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: stage.color ? `${stage.color}20` : "#f3f4f6",
                color: stage.color || "#374151",
              }}
            >
              {stage.name}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-stone-800/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-stone-100">
              {timelineData.summary.total_days}
            </div>
            <div className="text-xs text-gray-500 dark:text-stone-400">dias de jornada</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-stone-800/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-stone-100">
              {timelineData.summary.total_messages}
            </div>
            <div className="text-xs text-gray-500 dark:text-stone-400">mensagens</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-stone-800/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-stone-100">
              {lead.qualification_score ?? "-"}
            </div>
            <div className="text-xs text-gray-500 dark:text-stone-400">score</div>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/dashboard/leads/${id}/timeline${f.key !== "all" ? `?filter=${f.key}` : ""}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === f.key
                ? "bg-orange-600 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-50 dark:bg-stone-900 dark:text-stone-300 dark:ring-1 dark:ring-stone-800 dark:hover:bg-stone-800"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Timeline */}
      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        {renderItems.length > 0 ? (
          <div className="relative">
            <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200 dark:bg-stone-800" />

            <div className="space-y-6">
              {renderItems.map((item, index) => {
                const prev = index > 0 ? renderItems[index - 1] : null
                const daysBetween = prev
                  ? Math.floor(
                      (new Date(itemTimestamp(item)).getTime() -
                        new Date(itemTimestamp(prev)).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : 0

                return (
                  <div key={`item-${index}`}>
                    {daysBetween > 0 && (
                      <div className="relative mb-4 flex items-center justify-center py-2">
                        <div className="rounded-full bg-gray-100 px-3 py-0.5 text-xs text-gray-400 dark:bg-stone-800 dark:text-stone-500">
                          {daysBetween} dia{daysBetween > 1 ? "s" : ""} depois
                        </div>
                      </div>
                    )}

                    {item.kind === "messages"
                      ? renderMessageGroup(item.events, index)
                      : renderEvent(item.event)}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400 dark:text-stone-500">
            Nenhum evento encontrado.
          </p>
        )}
      </div>
    </div>
  )
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ChipPair({ chip }: { chip: Chip }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      {chip.from && (
        <>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-stone-800 dark:text-stone-300">
            {chip.from}
          </span>
          <span className="text-gray-400 dark:text-stone-500">→</span>
        </>
      )}
      <span className="rounded-md bg-blue-100 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
        {chip.to}
      </span>
    </div>
  )
}

function renderEvent(event: TimelineEvent) {
  const colors = actorColors[event.actor] ?? actorColors.system!
  const icon = event.isMessage
    ? messageIcons[event.type] ?? "💬"
    : ACTIVITY_ICONS[event.type] ?? "📌"

  return (
    <div className="relative flex gap-4 pl-2">
      <div
        className={`relative z-10 mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${colors.dot}`}
      >
        <span className="text-[10px]">{icon}</span>
      </div>

      <div className={`flex-1 rounded-lg ${colors.bg} p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold ${colors.text}`}>
              {event.actorLabel}
            </span>
            <span className="text-xs font-medium text-gray-700 dark:text-stone-300">
              {event.title}
            </span>
          </div>
          <span className="whitespace-nowrap text-xs text-gray-400 dark:text-stone-500">
            {formatTime(event.timestamp)}
          </span>
        </div>
        {event.chips && <ChipPair chip={event.chips} />}
        {event.description && (
          <MessageText
            content={event.description}
            className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-stone-300"
          />
        )}
      </div>
    </div>
  )
}

function renderMessageGroup(events: TimelineEvent[], index: number) {
  const counts = { lead: 0, nicole: 0, broker: 0 }
  for (const e of events) {
    if (e.actor === "lead") counts.lead++
    else if (e.actor === "nicole") counts.nicole++
    else if (e.actor === "broker") counts.broker++
  }
  const parts: string[] = []
  if (counts.lead) parts.push(`${counts.lead} do lead`)
  if (counts.nicole) parts.push(`${counts.nicole} da Nicole`)
  if (counts.broker) parts.push(`${counts.broker} do corretor`)
  const total = events.length

  return (
    <div className="relative flex gap-4 pl-2">
      <div className="relative z-10 mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 dark:bg-stone-600">
        <span className="text-[10px]">💬</span>
      </div>
      <details className="flex-1 rounded-lg bg-gray-50 p-4 dark:bg-stone-800/50">
        <summary className="cursor-pointer list-none text-sm text-gray-600 marker:content-none dark:text-stone-300">
          <span className="font-medium">
            {total} mensage{total > 1 ? "ns" : "m"} trocada{total > 1 ? "s" : ""}
          </span>
          {parts.length > 0 && (
            <span className="text-gray-400 dark:text-stone-500"> · {parts.join(" · ")}</span>
          )}
          <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">expandir</span>
        </summary>
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-stone-700">
          {events.map((e, i) => {
            const colors = actorColors[e.actor] ?? actorColors.system!
            return (
              <div key={`msg-${index}-${i}`} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold ${colors.text}`}>{e.actorLabel}</span>
                  <span className="whitespace-nowrap text-xs text-gray-400 dark:text-stone-500">
                    {formatTime(e.timestamp)}
                  </span>
                </div>
                <MessageText
                  content={e.description}
                  className="mt-0.5 whitespace-pre-wrap text-gray-700 dark:text-stone-300"
                />
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

/**
 * Monta o "prontuário" do lead a partir de messages + activities + appointments
 * + follow-up logs, com ATOR explícito (humano/Nicole/automação) e chips de→para.
 */
async function fetchTimelineData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string
): Promise<TimelineData> {
  const events: TimelineEvent[] = []

  // 1. Messages
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)

  if (conversations && conversations.length > 0) {
    const conversationIds = conversations.map((c) => c.id)
    const { data: messages } = await supabase
      .from("messages")
      .select("id, role, content, created_at, metadata")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true })

    if (messages) {
      for (const msg of messages) {
        let actor: TimelineEvent["actor"]
        let msgType: string
        let actorLabel: string
        const meta = (msg.metadata as Record<string, unknown> | null) ?? {}

        switch (msg.role) {
          case "user":
            actor = "lead"
            msgType = "message_lead"
            actorLabel = "Lead"
            break
          case "assistant":
            actor = "nicole"
            msgType = "message_nicole"
            actorLabel = "Nicole (IA)"
            break
          case "broker":
            actor = "broker"
            msgType = "message_broker"
            actorLabel = (meta.broker_name as string) || "Corretor"
            break
          default:
            actor = "system"
            msgType = "message_system"
            actorLabel = "Sistema"
        }

        events.push({
          type: msgType,
          actor,
          actorLabel,
          title: "",
          description:
            msg.content.length > 240 ? msg.content.substring(0, 240) + "..." : msg.content,
          timestamp: msg.created_at,
          chips: null,
          isMessage: true,
          metadata: { message_id: msg.id, ...meta },
        })
      }
    }
  }

  // 2. Activities (o coração do prontuário)
  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, description, created_at, metadata, user_id, users:user_id(name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })

  // Resolve nomes de usuários referenciados nos metadados (de→para de transferências,
  // bolsão, handoff) numa única query.
  const refUserIds = new Set<string>()
  for (const a of activities ?? []) {
    const m = (a.metadata as Record<string, unknown> | null) ?? {}
    for (const k of ["from_user_id", "to_user_id", "from_broker_id", "broker_id", "to_broker_id"]) {
      const v = m[k]
      if (typeof v === "string" && v) refUserIds.add(v)
    }
  }
  const userNames = new Map<string, string>()
  if (refUserIds.size > 0) {
    const { data: refUsers } = await supabase
      .from("users")
      .select("id, name")
      .in("id", Array.from(refUserIds))
    for (const u of refUsers ?? []) userNames.set(u.id as string, (u.name as string) ?? "")
  }

  if (activities) {
    for (const activity of activities) {
      const type = activity.type as string
      const meta = (activity.metadata as Record<string, unknown> | null) ?? {}

      const userRaw = (activity as { users?: { name: string } | { name: string }[] | null }).users
      const humanName =
        (Array.isArray(userRaw) ? userRaw[0]?.name : userRaw?.name) ||
        (meta.corretor as { nome?: string } | undefined)?.nome ||
        (meta.broker_name as string | undefined) ||
        null

      // Ator
      let actor: TimelineEvent["actor"]
      let actorLabel: string
      if (humanName) {
        actor = "broker"
        actorLabel = humanName
      } else if (IA_TYPES.has(type)) {
        actor = "nicole"
        actorLabel = "Nicole (IA)"
      } else {
        actor = "system"
        const sub = SYSTEM_SUBLABEL[type]
        actorLabel = sub ? `Sistema · ${sub}` : "Sistema"
      }

      // Chips de→para
      let chips: Chip | null = null
      if (type === "stage_change") {
        const from = (meta.from_stage as { name?: string } | null)?.name ?? null
        const to = (meta.to_stage as { name?: string } | null)?.name ?? "?"
        chips = { from, to, kind: "stage" }
      } else if (type === "transfer") {
        const fromId = meta.from_user_id as string | undefined
        const toId = meta.to_user_id as string | undefined
        chips = {
          from: fromId ? userNames.get(fromId) ?? "—" : null,
          to: (toId ? userNames.get(toId) : undefined) ?? "outro usuário",
          kind: "broker",
        }
      } else if (type === "broker_assigned") {
        chips = { from: null, to: (meta.broker_name as string) ?? "corretor", kind: "broker" }
      } else if (type === "handoff") {
        const toId = meta.broker_id as string | undefined
        if (toId && userNames.get(toId)) chips = { from: null, to: userNames.get(toId)!, kind: "broker" }
      } else if (type === "bolsao_in") {
        const fromId = meta.from_broker_id as string | undefined
        chips = { from: fromId ? userNames.get(fromId) ?? "—" : null, to: "Bolsão", kind: "pool" }
      }

      // Descrição: para eventos com chips, a descrição prosaica costuma repetir o
      // de→para — nesses casos deixamos os chips falarem. Motivo de transferência/perda
      // permanece útil.
      let description = activity.description || ""
      if (type === "stage_change" || type === "broker_assigned") description = ""
      if ((type === "transfer" || type === "lead_reactivated") && typeof meta.motivo === "string") description = `Motivo: ${meta.motivo}`
      if ((type === "lead_lost" || type === "lead") && typeof meta.reason === "string" && meta.reason)
        description = `Motivo: ${meta.reason}`

      // lead_created: enriquece com a origem, se houver.
      let title = ACTIVITY_LABELS[type] ?? type
      if (type === "lead_created") {
        const src = meta.source as string | undefined
        if (src) title = `Lead criado · ${SOURCE_LABELS[src] ?? src}`
      }

      events.push({
        type,
        actor,
        actorLabel,
        title,
        description,
        timestamp: activity.created_at,
        chips,
        isMessage: false,
        metadata: { activity_id: activity.id, activity_type: type, ...meta },
      })
    }
  }

  // 3. Appointments
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, scheduled_at, status, notes, location, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })

  if (appointments) {
    for (const appt of appointments) {
      const statusLabels: Record<string, string> = {
        scheduled: "agendada",
        confirmed: "confirmada",
        completed: "concluída",
        cancelled: "cancelada",
        no_show: "não compareceu",
        // Story 75-321 — encerrada pelo cron sem confirmação de presença.
        closed: "encerrada sem registro",
      }
      events.push({
        type: "appointment",
        actor: "system",
        actorLabel: "Sistema · Agenda",
        title: `Visita ${statusLabels[appt.status] ?? appt.status}`,
        description: `Visita para ${new Date(appt.scheduled_at).toLocaleString("pt-BR")}${appt.location ? ` em ${appt.location}` : ""}`,
        timestamp: appt.created_at,
        chips: null,
        isMessage: false,
        metadata: {
          appointment_id: appt.id,
          scheduled_at: appt.scheduled_at,
          status: appt.status,
        },
      })
    }
  }

  // 4. Follow-up logs
  const { data: followUpLogs } = await supabase
    .from("follow_up_log")
    .select("id, type, status, message, created_at, sent_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })

  if (followUpLogs) {
    for (const log of followUpLogs) {
      const isNicole = log.type === "nicole_sent"
      events.push({
        type: "followup",
        actor: isNicole ? "nicole" : "system",
        actorLabel: isNicole ? "Nicole (IA)" : "Sistema · Follow-up",
        title: isNicole ? "Follow-up automático" : "Alerta de follow-up",
        description:
          log.message ||
          (isNicole ? "Nicole enviou follow-up automático" : "Alerta enviado ao corretor"),
        timestamp: log.sent_at || log.created_at,
        chips: null,
        isMessage: false,
        metadata: { followup_id: log.id, followup_type: log.type, followup_status: log.status },
      })
    }
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const totalDays =
    events.length > 0
      ? Math.ceil(
          (new Date(events[events.length - 1]!.timestamp).getTime() -
            new Date(events[0]!.timestamp).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0

  const totalMessages = events.filter((e) => e.isMessage).length

  const { data: leadData } = await supabase
    .from("leads")
    .select("created_at")
    .eq("id", leadId)
    .single()

  return {
    events,
    summary: {
      total_days: totalDays,
      total_messages: totalMessages,
      total_events: events.length,
      lead_created_at: leadData?.created_at ?? "",
    },
  }
}
