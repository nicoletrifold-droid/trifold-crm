import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"

interface TimelineEvent {
  type: string
  actor: "lead" | "nicole" | "broker" | "system"
  title: string
  description: string
  timestamp: string
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

const typeIcons: Record<string, string> = {
  message_lead: "💬",
  message_nicole: "🤖",
  message_broker: "👤",
  message_system: "⚙️",
  activity: "📋",
  appointment: "📅",
  followup: "🔔",
}

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

  // Verify lead exists
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

  // Fetch timeline data from internal API by replicating the logic server-side
  const timelineData = await fetchTimelineData(supabase, id)

  // Apply filter
  const activeFilter = filters.filter || "all"
  const filteredEvents =
    activeFilter === "all"
      ? timelineData.events
      : timelineData.events.filter((e) => e.actor === activeFilter)

  return (
    <div className="space-y-6">
      {/* Back link */}
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
              Timeline - {lead.name || "Sem nome"}
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
        {[
          { key: "all", label: "Todos" },
          { key: "lead", label: "Lead" },
          { key: "nicole", label: "Nicole" },
          { key: "broker", label: "Corretor" },
          { key: "system", label: "Sistema" },
        ].map((f) => (
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
        {filteredEvents.length > 0 ? (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200 dark:bg-stone-800" />

            <div className="space-y-6">
              {filteredEvents.map((event, index) => {
                const colors = actorColors[event.actor] ?? actorColors.system!
                const icon = typeIcons[event.type] ?? "📌"
                const prevEvent = index > 0 ? filteredEvents[index - 1] : null
                const daysBetween = prevEvent
                  ? Math.floor(
                      (new Date(event.timestamp).getTime() -
                        new Date(prevEvent.timestamp).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : 0

                return (
                  <div key={`${event.type}-${event.timestamp}-${index}`}>
                    {/* Duration separator */}
                    {daysBetween > 0 && (
                      <div className="relative mb-4 flex items-center justify-center py-2">
                        <div className="rounded-full bg-gray-100 px-3 py-0.5 text-xs text-gray-400 dark:bg-stone-800 dark:text-stone-500">
                          {daysBetween} dia{daysBetween > 1 ? "s" : ""} depois
                        </div>
                      </div>
                    )}

                    <div className="relative flex gap-4 pl-2">
                      {/* Dot */}
                      <div
                        className={`relative z-10 mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${colors.dot}`}
                      >
                        <span className="text-[10px]">{icon}</span>
                      </div>

                      {/* Content */}
                      <div
                        className={`flex-1 rounded-lg ${colors.bg} p-4`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold uppercase ${colors.text}`}
                            >
                              {colors.label}
                            </span>
                            <span className="text-xs font-medium text-gray-700 dark:text-stone-300">
                              {event.title}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-stone-500">
                            {new Date(event.timestamp).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-stone-300">
                          {event.description}
                        </p>
                      </div>
                    </div>
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

/**
 * Fetch timeline data directly from Supabase (server-side).
 * This mirrors the logic from /api/leads/[id]/timeline but avoids an internal fetch.
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
        let title: string

        switch (msg.role) {
          case "user":
            actor = "lead"
            msgType = "message_lead"
            title = "Mensagem do lead"
            break
          case "assistant":
            actor = "nicole"
            msgType = "message_nicole"
            title = "Mensagem da Nicole"
            break
          case "broker":
            actor = "broker"
            msgType = "message_broker"
            title = "Mensagem do corretor"
            break
          default:
            actor = "system"
            msgType = "message_system"
            title = "Mensagem do sistema"
        }

        events.push({
          type: msgType,
          actor,
          title,
          description:
            msg.content.length > 200
              ? msg.content.substring(0, 200) + "..."
              : msg.content,
          timestamp: msg.created_at,
          metadata: {
            message_id: msg.id,
            full_content: msg.content,
            ...(msg.metadata as Record<string, unknown> ?? {}),
          },
        })
      }
    }
  }

  // 2. Activities
  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, description, created_at, metadata")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })

  if (activities) {
    for (const activity of activities) {
      const typeLabels: Record<string, string> = {
        stage_change: "Mudança de etapa",
        appointment_created: "Agendamento criado",
        appointment_completed: "Agendamento concluído",
        broker_assigned: "Corretor atribuído",
        qualification_updated: "Qualificação atualizada",
        handoff: "Transferência para corretor",
        followup_alert_broker: "Alerta de follow-up",
        followup_nicole_sent: "Follow-up automático",
        note_added: "Nota adicionada",
      }

      events.push({
        type: "activity",
        actor: "system",
        title: typeLabels[activity.type] ?? activity.type,
        description: activity.description || activity.type,
        timestamp: activity.created_at,
        metadata: {
          activity_id: activity.id,
          activity_type: activity.type,
          ...(activity.metadata as Record<string, unknown> ?? {}),
        },
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
      }

      events.push({
        type: "appointment",
        actor: "system",
        title: `Visita ${statusLabels[appt.status] ?? appt.status}`,
        description: `Visita agendada para ${new Date(appt.scheduled_at).toLocaleString("pt-BR")}${appt.location ? ` em ${appt.location}` : ""}`,
        timestamp: appt.created_at,
        metadata: {
          appointment_id: appt.id,
          scheduled_at: appt.scheduled_at,
          status: appt.status,
          notes: appt.notes,
          location: appt.location,
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
        title: isNicole
          ? "Follow-up automático (Nicole)"
          : "Alerta de follow-up",
        description:
          log.message ||
          (isNicole
            ? "Nicole enviou follow-up automático"
            : "Alerta enviado ao corretor"),
        timestamp: log.sent_at || log.created_at,
        metadata: {
          followup_id: log.id,
          followup_type: log.type,
          followup_status: log.status,
        },
      })
    }
  }

  // Sort by timestamp
  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  // Calculate summary
  const totalDays =
    events.length > 0
      ? Math.ceil(
          (new Date(events[events.length - 1]!.timestamp).getTime() -
            new Date(events[0]!.timestamp).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0

  const totalMessages = events.filter((e) =>
    e.type.startsWith("message_")
  ).length

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
