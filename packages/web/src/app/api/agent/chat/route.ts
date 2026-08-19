import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAnthropicClient, ANTHROPIC_MODELS } from "@trifold/ai"
import {
  buildContext,
  fetchPipelineAggregates,
  fetchLeadDrill,
  fetchLeadConversations,
  requiresDrill,
  requiresConversation,
  requiresLossBreakdown,
  fetchLostReasonBreakdown,
  requiresCreative,
  fetchCreativePerformance,
  extractDateWindow,
  type DateWindow,
} from "@web/lib/agent/context-builder"
import { isAdmin, isAdminOrSupervisor } from "@web/lib/agent/auth-helpers"
import { AGENT_SYSTEM_PROMPT } from "@web/lib/agent/system-prompt"

// Cap de duração da função (Vercel). Sem isto, a função fica pendurada caso a
// chamada ao LLM trave — o SDK Anthropic tem timeout default ~10min + retries.
export const maxDuration = 60

// ─── On-demand extraction helpers (Story 52-2) ────────────────────────────────
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const STAGE_TYPES = [
  "novo",
  "qualificado",
  "agendado",
  "visitou",
  "proposta",
  "fechado",
  "perdido",
]

// Extrai um lead_id (UUID) da mensagem como melhor esforço. Retorna null se não
// houver UUID identificável — nesse caso a busca de conversa NÃO é disparada
// (Story 52-2 T6.3). O nome do lead não basta para resolver lead_id sem uma
// query adicional; mantemos o contrato conservador (UUID explícito).
function extractLeadId(userMessage: string): string | null {
  const m = UUID_RE.exec(userMessage)
  return m ? m[0] : null
}

// Extrai filtros de drill (campanha e stage_type) da mensagem — melhor esforço,
// sem inventar campos. Campanha entre aspas tem prioridade; stage_type é casado
// contra o enum conhecido.
function extractDrillFilters(userMessage: string): { campaign?: string; stageType?: string } {
  const filters: { campaign?: string; stageType?: string } = {}
  const quoted = /["'“”]([^"'“”]{2,80})["'“”]/.exec(userMessage)
  if (quoted) filters.campaign = quoted[1]!.trim()
  const lower = userMessage.toLowerCase()
  const stage = STAGE_TYPES.find((s) => lower.includes(s))
  if (stage) filters.stageType = stage
  return filters
}

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
    date_window?: { startDate: string; endDate: string }
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const { session_id, message, context_type = "global", context_id, date_window } = body

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

  // ── Extrai janela de datas (Story 52-8) ───────────────────────────────────
  let dateWindow: DateWindow
  let dateWindowSource: "ui" | "nl" = "nl"

  if (date_window) {
    if (!date_window.startDate || !date_window.endDate || date_window.startDate > date_window.endDate) {
      return NextResponse.json({ error: "INVALID_DATE_RANGE" }, { status: 400 })
    }
    const diffDays = Math.ceil(
      (new Date(date_window.endDate).getTime() - new Date(date_window.startDate).getTime()) / 86400000,
    )
    if (diffDays > 90) {
      const cappedEnd = new Date(date_window.startDate)
      cappedEnd.setDate(cappedEnd.getDate() + 90)
      dateWindow = { startDate: date_window.startDate, endDate: cappedEnd.toISOString().split("T")[0]! }
    } else {
      dateWindow = { startDate: date_window.startDate, endDate: date_window.endDate }
    }
    dateWindowSource = "ui"
  } else {
    dateWindow = extractDateWindow(message)
  }
  console.log("[52-8] date window:", dateWindow, "source:", dateWindowSource)

  // ── Build context (mídia — sempre, para todos os roles; CON-5) ──────────────
  const mediaContext = await buildContext(supabase, appUser.org_id, context_type, context_id, dateWindow)

  // ── Gate de CRM (Story 52-2) — decisão de produto: SOMENTE admin ─────────────
  // Único ponto de decisão para acesso a dados de pipeline/CRM. Verificação
  // via capability agente.contexto_crm (isAdmin async — 75-313); nem módulo nem
  // is_admin_or_supervisor(). A RLS das views/RPC (Story 52-1) é a 2ª camada.
  const admin = await isAdmin(appUser)
  let pipelineContext = ""

  if (admin) {
    // Agregados (sem PII) — sempre para admin, cacheáveis (AC1, AC2, AC3, AC8)
    pipelineContext += "\n\n" + (await fetchPipelineAggregates(supabase, appUser.org_id, dateWindow))

    // Motivos de perda on-demand (Story 75-264) — agregados + texto cru dos não
    // classificados, com cobertura declarada. A view re-verifica admin+org (RLS).
    if (requiresLossBreakdown(message)) {
      // Perda é dado ACUMULADO: sem pedido explícito de período (UI ou texto),
      // olha todo o histórico — o default implícito de 30d do extractor
      // esconderia a maior parte das perdas.
      const explicitWindow =
        dateWindowSource === "ui" || dateWindow.label !== "Últimos 30 dias"
          ? dateWindow
          : undefined
      const loss = await fetchLostReasonBreakdown(supabase, appUser.org_id, explicitWindow)
      if (loss) pipelineContext += "\n\n" + loss
    }

    // Drill on-demand (PII) — disparado por heurística; fail-closed (AC4, AC6)
    if (requiresDrill(message)) {
      const drill = await fetchLeadDrill(supabase, appUser.org_id, sessionId ?? null, extractDrillFilters(message))
      pipelineContext += "\n\n" + (drill ??
        "[DADOS SENSÍVEIS INDISPONÍVEIS — acesso de auditoria não pôde ser registrado neste momento. Informe o usuário que o detalhamento de lead não está disponível temporariamente.]")
    }

    // Conversa on-demand (PII) — disparado por heurística; fail-closed (AC5, AC6)
    if (requiresConversation(message)) {
      const leadId = extractLeadId(message)
      if (leadId) {
        const conv = await fetchLeadConversations(supabase, appUser.org_id, sessionId ?? null, leadId)
        pipelineContext += "\n\n" + (conv ??
          "[DADOS SENSÍVEIS INDISPONÍVEIS — acesso de auditoria não pôde ser registrado neste momento. Informe o usuário que o conteúdo da conversa não está disponível temporariamente.]")
      }
    }
  } else {
    // Non-admin: nenhum dado de CRM buscado nem injetado (AC13, CON-5).
    console.log("[52-2] pipeline CRM ignorado para request non-admin")
  }

  // ── Gate de criativo (Story 52-6) — INDEPENDENTE do bloco if(admin) acima ───
  // Acesso ampliado: admin + supervisor + gerente-comercial (isAdminOrSupervisor).
  // Dados agregados anônimos (sem PII) — sem log_pii_access, sem fail-closed.
  // O bloco if(admin) de pipeline CRM (52-2) NÃO é tocado por esta lógica.
  let creativeContext = ""
  const adminOrSupervisor = await isAdminOrSupervisor(appUser)
  if (adminOrSupervisor && requiresCreative(message)) {
    const creative = await fetchCreativePerformance(supabase, appUser.org_id, dateWindow)
    if (creative) {
      creativeContext += "\n\n" + creative
      console.log("[52-6] creative context injected for org: " + appUser.org_id)
    }
  } else if (!adminOrSupervisor) {
    console.log("[52-6] creative context skipped — role not authorized")
  }

  // Contexto final: mídia sempre + pipeline (admin) + criativo (admin/sup/gerente) — aditivo
  const contextText = mediaContext + pipelineContext + creativeContext

  // ── Stream from Claude ─────────────────────────────────────────────────────
  const anthropic = createAnthropicClient()
  const encoder   = new TextEncoder()
  let fullText    = ""

  const stream = new ReadableStream({
    async start(controller) {
      // Timeout server-side de 45s na chamada ao LLM. Se o Anthropic travar/demorar,
      // abortamos para falhar rápido em vez de pendurar a função até o maxDuration.
      const ac = new AbortController()
      const llmTimeout = setTimeout(() => ac.abort(), 45000)
      try {
        const claudeStream = anthropic.messages.stream(
          {
            model: ANTHROPIC_MODELS.sonnet46,
            max_tokens: 2048,
            system: `${AGENT_SYSTEM_PROMPT}\n\n---\n\n${contextText}`,
            messages: [
              ...history,
              { role: "user", content: message },
            ],
          },
          { signal: ac.signal },
        )

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

        // Stream concluído com sucesso — desarma o timeout do LLM.
        clearTimeout(llmTimeout)

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
        clearTimeout(llmTimeout)
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || ac.signal.aborted)
        // Log detalhado no servidor para diagnóstico (sempre).
        console.error("[agent/chat] stream error:", err)
        const clientMsg = isAbort
          ? "O agente demorou demais para responder (timeout). Tente novamente ou reduza o período consultado."
          : err instanceof Error
            ? err.message
            : String(err)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: clientMsg })}\n\n`),
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
