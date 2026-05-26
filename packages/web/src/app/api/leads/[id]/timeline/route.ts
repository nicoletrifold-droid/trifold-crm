import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

interface TimelineEvent {
  type: string
  actor: "lead" | "nicole" | "broker" | "system"
  title: string
  description: string
  timestamp: string
  metadata: Record<string, unknown>
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Verify lead belongs to org
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, created_at")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  const events: TimelineEvent[] = []

  // 1. Messages from conversations
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", id)

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
    .eq("lead_id", id)
    .order("created_at", { ascending: true })

  if (activities) {
    for (const activity of activities) {
      events.push({
        type: "activity",
        actor: "system",
        title: formatActivityType(activity.type),
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
    .eq("lead_id", id)
    .order("created_at", { ascending: true })

  if (appointments) {
    for (const appt of appointments) {
      events.push({
        type: "appointment",
        actor: "system",
        title: `Visita ${formatAppointmentStatus(appt.status)}`,
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
    .eq("lead_id", id)
    .order("created_at", { ascending: true })

  if (followUpLogs) {
    for (const log of followUpLogs) {
      const isNicole = log.type === "nicole_sent"
      events.push({
        type: "followup",
        actor: isNicole ? "nicole" : "system",
        title: isNicole
          ? "Follow-up automatico (Nicole)"
          : "Alerta de follow-up",
        description: log.message || (isNicole ? "Nicole enviou follow-up automatico" : "Alerta enviado ao corretor"),
        timestamp: log.sent_at || log.created_at,
        metadata: {
          followup_id: log.id,
          followup_type: log.type,
          followup_status: log.status,
        },
      })
    }
  }

  // Sort all events by timestamp
  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  // Calculate journey summary
  const totalDays =
    events.length > 0
      ? Math.ceil(
          (new Date(events[events.length - 1]!.timestamp).getTime() -
            new Date(events[0]!.timestamp).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0

  const totalMessages = events.filter((e) => e.type.startsWith("message_")).length

  return NextResponse.json({
    data: {
      events,
      summary: {
        total_days: totalDays,
        total_messages: totalMessages,
        total_events: events.length,
        lead_created_at: lead.created_at,
      },
    },
  })
}

function formatActivityType(type: string): string {
  const labels: Record<string, string> = {
    stage_change: "Mudanca de etapa",
    appointment_created: "Agendamento criado",
    appointment_completed: "Agendamento concluido",
    broker_assigned: "Corretor atribuido",
    qualification_updated: "Qualificacao atualizada",
    handoff: "Transferencia para corretor",
    followup_alert_broker: "Alerta de follow-up",
    followup_nicole_sent: "Follow-up automatico",
    note_added: "Nota adicionada",
  }
  return labels[type] ?? type
}

function formatAppointmentStatus(status: string): string {
  const labels: Record<string, string> = {
    scheduled: "agendada",
    confirmed: "confirmada",
    completed: "concluida",
    cancelled: "cancelada",
    no_show: "nao compareceu",
  }
  return labels[status] ?? status
}
