import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

interface JourneyEvent {
  type: string
  title: string
  description: string | null
  timestamp: string
  metadata: Record<string, unknown> | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Verify lead exists and belongs to org
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  const events: JourneyEvent[] = []

  // Fetch activities
  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, description, metadata, created_at, user:users(name)")
    .eq("lead_id", id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: true })

  for (const activity of activities ?? []) {
    const activityUserArr = activity.user as unknown as Array<{
      name: string
    }> | null
    const activityUser = activityUserArr?.[0] ?? null

    events.push({
      type: activity.type,
      title: activity.type.replace(/_/g, " "),
      description: activity.description,
      timestamp: activity.created_at,
      metadata: {
        ...(activity.metadata as Record<string, unknown> | null),
        user_name: activityUser?.name ?? null,
      },
    })
  }

  // Fetch messages to extract key moments
  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      `
      id, channel,
      messages:messages(id, role, content, created_at)
    `
    )
    .eq("lead_id", id)
    .order("last_message_at", { ascending: true })

  for (const conv of conversations ?? []) {
    const messages = (conv.messages ?? []) as Array<{
      id: string
      role: string
      content: string
      created_at: string
    }>

    if (messages.length === 0) continue

    const sorted = [...messages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // First message
    const first = sorted[0]!
    events.push({
      type: "first_message",
      title: `Primeira mensagem (${conv.channel})`,
      description: first.content.substring(0, 200),
      timestamp: first.created_at,
      metadata: { channel: conv.channel, role: first.role, conversation_id: conv.id },
    })

    // Last message (if different from first)
    if (sorted.length > 1) {
      const last = sorted[sorted.length - 1]!
      events.push({
        type: "last_message",
        title: `Ultima mensagem (${conv.channel})`,
        description: last.content.substring(0, 200),
        timestamp: last.created_at,
        metadata: { channel: conv.channel, role: last.role, conversation_id: conv.id },
      })
    }

    // Handoff moments (messages from broker role)
    const handoffs = sorted.filter((m) => m.role === "broker")
    if (handoffs.length > 0) {
      const firstHandoff = handoffs[0]!
      events.push({
        type: "handoff",
        title: `Handoff para corretor (${conv.channel})`,
        description: firstHandoff.content.substring(0, 200),
        timestamp: firstHandoff.created_at,
        metadata: { channel: conv.channel, conversation_id: conv.id },
      })
    }
  }

  // Sort all events chronologically
  events.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return NextResponse.json({ data: events })
}
