import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAnthropicClient } from "@trifold/ai"
import { buildContext } from "@web/lib/agent/context-builder"
import { AGENT_SYSTEM_PROMPT } from "@web/lib/agent/system-prompt"

// ─── Rate limiting (in-memory, per user, 20 msg/min) ──────────────────────────
const rateLimitMap = new Map<string, number[]>()
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const window = 60 * 1000
  const existing = rateLimitMap.get(userId) ?? []
  const recent = existing.filter((t) => now - t < window)
  if (recent.length >= 20) return false
  recent.push(now)
  rateLimitMap.set(userId, recent)
  return true
}

// ─── Action card extraction ───────────────────────────────────────────────────
const ACTION_CARD_RE = /<action_card>([\s\S]*?)<\/action_card>/
function extractActionCard(text: string): { cleanText: string; actionCard: Record<string, unknown> | null } {
  const match = ACTION_CARD_RE.exec(text)
  if (!match) return { cleanText: text, actionCard: null }
  try {
    const actionCard = JSON.parse(match[1]!.trim()) as Record<string, unknown>
    const cleanText = text.replace(ACTION_CARD_RE, "").trim()
    return { cleanText, actionCard }
  } catch {
    return { cleanText: text, actionCard: null }
  }
}

// ─── POST /api/agent/chat ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!checkRateLimit(appUser.id)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 })
  }

  let body: {
    session_id?: string
    message: string
    context_type?: "global" | "campaign"
    context_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const { session_id, message, context_type = "global", context_id } = body

  if (!message?.trim()) {
    return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 })
  }

  // ── Resolve or create session ──────────────────────────────────────────────
  let sessionId = session_id
  if (!sessionId) {
    const title = message.length > 60 ? `${message.slice(0, 57)}...` : message
    const { data: newSession, error: sessionErr } = await supabase
      .from("agent_chat_sessions")
      .insert({
        org_id: appUser.org_id,
        user_id: appUser.id,
        title,
        context_type,
        context_id: context_id ?? null,
      })
      .select("id")
      .single()

    if (sessionErr || !newSession) {
      return NextResponse.json({ error: "SESSION_CREATE_FAILED" }, { status: 500 })
    }
    sessionId = newSession.id
  } else {
    // Verify session belongs to user's org
    const { data: session } = await supabase
      .from("agent_chat_sessions")
      .select("id, org_id")
      .eq("id", sessionId)
      .eq("org_id", appUser.org_id)
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 })
    }
  }

  // ── Load history (last 20 messages) ───────────────────────────────────────
  const { data: historyRows } = await supabase
    .from("agent_chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20)

  const history = (historyRows ?? []).map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }))

  // ── Save user message ──────────────────────────────────────────────────────
  await supabase.from("agent_chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: message,
  })

  // ── Build context ──────────────────────────────────────────────────────────
  const contextText = await buildContext(supabase, appUser.org_id, context_type, context_id)

  // ── Stream from Claude ─────────────────────────────────────────────────────
  const anthropic = createAnthropicClient()
  const encoder   = new TextEncoder()
  let fullText    = ""

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: `${AGENT_SYSTEM_PROMPT}\n\n---\n\n${contextText}`,
          messages: [
            ...history,
            { role: "user", content: message },
          ],
        })

        for await (const chunk of claudeStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            fullText += chunk.delta.text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`),
            )
          }
        }

        // Extract action card from full text before saving
        const { cleanText, actionCard } = extractActionCard(fullText)

        // Save assistant message
        await supabase.from("agent_chat_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: cleanText,
          action_card: actionCard,
          action_status: actionCard ? "pending" : null,
        })

        // Touch session updated_at
        await supabase
          .from("agent_chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId)

        // Signal done with session_id for new sessions
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, session_id: sessionId, has_action: !!actionCard })}\n\n`),
        )
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Session-Id": sessionId ?? "",
    },
  })
}
