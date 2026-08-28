import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createAnthropicClient,
  detectObjection,
  draftCoachReply,
  isCoachEligible,
  searchKnowledge,
  buildContextFromRAG,
  loadMemoryContext,
} from "@trifold/ai"
import {
  deriveBrokerActive,
  resolveTakeoverAnchor,
  shouldReactivateAi,
  BROKER_WINDOW_MS,
} from "@web/lib/broker/broker-takeover-status"
import { can } from "@web/lib/permissions"
import { logEvent } from "@web/lib/logger"

/**
 * Story 90-1 (Epic 90) — Live Coach: gera a sugestão de resposta à objeção do
 * lead quando o CORRETOR está conduzindo a conversa.
 *
 * Chamado pelo webhook do WhatsApp (`api/webhook/whatsapp/route.ts`) dentro de
 * um `after()` DEDICADO, logo após o INSERT da mensagem inbound.
 *
 * Contrato: **NUNCA lança**. Mesmo desenho de `notify-on-reply.ts` (63-12) —
 * uma falha aqui não pode afetar o webhook, o push ao corretor nem o pipeline
 * da Nicole (que roda em `after()` independente).
 *
 * Ordem dos gates (do mais barato ao mais caro — nenhuma IA antes do gate 4):
 *  1. Elegibilidade textual (`isCoachEligible`) — "ok"/emoji/link não chama modelo.
 *  2. Lead tem corretor atribuído.
 *  3. Humano no atendimento (`deriveBrokerActive`) + guarda de reativação.
 *  4. Capability `leads.live_coach` no perfil do corretor DONO (kill switch).
 *  5. Corretor não respondeu depois do inbound (anti-ruído tardio).
 *
 * Só depois disso: RAG → Haiku (detectar) → Sonnet (redigir) → persistir.
 */
export interface GenerateCoachSuggestionParams {
  /** Admin client recebido por parâmetro (facilita testes). */
  supabase: SupabaseClient
  leadId: string
  conversationId: string
  orgId: string
  /** `messages.id` da mensagem inbound — FK da sugestão. */
  messageId: string
  /** `messages.created_at` do inbound — referência do gate anti-ruído tardio. */
  messageCreatedAt: string
  /** Texto (ou transcrição, já resolvida pelo webhook) da mensagem do lead. */
  text: string
}

/** Quantas mensagens de contexto recente vão aos prompts. */
const HISTORY_LIMIT = 8

interface HistoryRow {
  role: string
  content: string | null
  created_at: string
}

/**
 * Formata o histórico para o prompt, do mais antigo ao mais recente.
 * `assistant` é a Nicole; o rótulo diz "Nicole" para o modelo não confundir a
 * fala da IA com a fala do corretor humano.
 */
export function formatRecentHistory(rows: readonly HistoryRow[]): string {
  const label: Record<string, string> = {
    user: "Lead",
    broker: "Corretor",
    assistant: "Nicole (IA)",
    system: "Sistema",
  }
  return rows
    .filter((r) => (r.content ?? "").trim().length > 0)
    .map((r) => `${label[r.role] ?? r.role}: ${(r.content ?? "").trim()}`)
    .join("\n")
}

export async function generateCoachSuggestion(
  params: GenerateCoachSuggestionParams
): Promise<void> {
  const {
    supabase,
    leadId,
    conversationId,
    orgId,
    messageId,
    messageCreatedAt,
    text,
  } = params

  const skip = (motivo: string, metadata: Record<string, unknown> = {}) =>
    logEvent({
      level: "info",
      category: "ai",
      event_type: "LIVE_COACH_SKIPPED",
      message: `Live Coach dispensado: ${motivo}`,
      metadata: { lead_id: leadId, conversation_id: conversationId, motivo, ...metadata },
      source: "lib/coach/generate-suggestion",
      org_id: orgId,
    })

  try {
    // ---- Gate 1: elegibilidade textual (antes de QUALQUER IA) --------------
    if (!isCoachEligible(text)) {
      skip("mensagem inelegivel")
      return
    }

    // ---- Gate 2: lead tem corretor atribuído ------------------------------
    const { data: lead } = await supabase
      .from("leads")
      .select("id, assigned_broker_id, ai_summary")
      .eq("id", leadId)
      .eq("org_id", orgId)
      .maybeSingle()

    const brokerUserId = lead?.assigned_broker_id as string | null | undefined
    if (!brokerUserId) {
      skip("lead sem corretor atribuido")
      return
    }

    // ---- Gate 3: humano no atendimento + guarda de reativação -------------
    // `deriveBrokerActive` = brokerSentRecently || !isAiActive. NÃO usar
    // `brokerSentRecently` puro: no handoff manual de admin e no handoff por
    // agendamento (`handoff_reason='appointment'`, 63-15) o corretor está no
    // comando SEM nunca ter enviado mensagem — e é justamente aí que o coach
    // mais vale (ele acabou de receber a conversa e o lead já objetou).
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, is_ai_active, handoff_at")
      .eq("id", conversationId)
      .maybeSingle()

    if (!conversation) {
      skip("conversa nao encontrada")
      return
    }

    const since = new Date(Date.now() - BROKER_WINDOW_MS).toISOString()
    const { data: brokerMsgs } = await supabase
      .from("messages")
      .select("role, created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "broker")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)

    const isAiActive = conversation.is_ai_active as boolean
    if (!deriveBrokerActive(brokerMsgs ?? [], isAiActive)) {
      skip("nicole conduzindo")
      return
    }

    // Guarda de race: este `after()` roda ANTES do bloco que resolve/atualiza
    // `is_ai_active` no webhook. Se a Nicole vai reassumir nesta mesma invocação
    // (corretor inativo >= 24h), a conversa não é do corretor — aborta. Sem isso
    // geraríamos sugestão para conversa que a IA retoma no instante seguinte.
    if (!isAiActive) {
      // A janela do gate 3 (24h) pode ter escondido uma msg de corretor mais
      // antiga; a âncora precisa da ÚLTIMA de todas, sem filtro de data.
      const { data: lastBrokerAny } = await supabase
        .from("messages")
        .select("created_at")
        .eq("conversation_id", conversationId)
        .eq("role", "broker")
        .order("created_at", { ascending: false })
        .limit(1)

      const anchor = resolveTakeoverAnchor(
        (conversation.handoff_at as string | null) ?? null,
        (lastBrokerAny?.[0]?.created_at as string | undefined) ?? null
      )
      if (shouldReactivateAi(anchor)) {
        skip("nicole vai reassumir")
        return
      }
    }

    // ---- Gate 4: capability do corretor DONO (kill switch) ----------------
    const habilitado = await can(brokerUserId, orgId, "leads.live_coach")
    if (!habilitado) {
      skip("capability leads.live_coach desligada")
      return
    }

    // ---- Gate 5: anti-ruído tardio ---------------------------------------
    // O corretor já respondeu depois desta mensagem do lead? Então a sugestão
    // chegaria atrasada e viraria ruído.
    const { data: brokerDepois } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("role", "broker")
      .gt("created_at", messageCreatedAt)
      .limit(1)

    if ((brokerDepois?.length ?? 0) > 0) {
      skip("corretor ja respondeu")
      return
    }

    // ---- Contexto: histórico recente, RAG e memória do lead ---------------
    const { data: historyRows } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)

    const recentHistory = formatRecentHistory(
      [...((historyRows ?? []) as HistoryRow[])].reverse()
    )

    // RAG é best-effort: falha aqui não aborta — a sugestão sai sem âncora e
    // marcada como `ancorada: false`, que é a informação honesta.
    let ragContext = ""
    try {
      const { data: state } = await supabase
        .from("conversation_state")
        .select("current_property_id")
        .eq("conversation_id", conversationId)
        .maybeSingle()

      const ragResults = await searchKnowledge(
        supabase,
        text,
        orgId,
        (state?.current_property_id as string | null) ?? undefined
      )
      ragContext = buildContextFromRAG(ragResults)
    } catch (ragError) {
      console.error("[live-coach] RAG falhou, seguindo sem contexto:", ragError)
    }

    let leadProfile = ""
    try {
      const memory = await loadMemoryContext(
        supabase,
        leadId,
        text,
        (lead?.ai_summary as string | null) ?? null
      )
      leadProfile = [memory.l1Snapshot, memory.l2TopicMemories]
        .filter((b) => (b ?? "").trim().length > 0)
        .join("\n\n")
    } catch (memError) {
      console.error("[live-coach] memória falhou, seguindo sem perfil:", memError)
    }

    // ---- Passo 1: detectar objeção (Haiku) --------------------------------
    const anthropic = createAnthropicClient()
    const deteccao = await detectObjection(anthropic, { message: text, recentHistory })

    if (!deteccao) {
      logEvent({
        level: "info",
        category: "ai",
        event_type: "LIVE_COACH_NO_OBJECTION",
        message: "Live Coach: nenhuma objeção detectada",
        metadata: { lead_id: leadId, conversation_id: conversationId },
        source: "lib/coach/generate-suggestion",
        org_id: orgId,
      })
      return
    }

    // ---- Passo 2: redigir rascunhos (Sonnet) ------------------------------
    const draft = await draftCoachReply(anthropic, {
      objecao: deteccao.objecao,
      tipo: deteccao.tipo,
      ragContext,
      leadProfile,
      recentHistory,
    })

    if (!draft) {
      skip("redacao invalida", { tipo: deteccao.tipo })
      return
    }

    // ---- Persistência ----------------------------------------------------
    // Uma sugestão ativa por conversa: a anterior é superseded, não empilhada.
    // O erro é LOGADO e não aborta (a sugestão nova vale mais que o supersede),
    // mas não pode passar em silêncio: se este UPDATE falhar, ficam duas ativas e
    // a 90-2 renderiza dois cards — AC8 violada sem ninguém notar (concern do @qa).
    const { error: supersedeError } = await supabase
      .from("coach_suggestions")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .is("used_at", null)
      .is("dismissed_at", null)

    if (supersedeError) {
      logEvent({
        level: "warn",
        category: "ai",
        event_type: "LIVE_COACH_SUPERSEDE_FAILED",
        message: `Live Coach não conseguiu descartar a sugestão anterior: ${supersedeError.message}`,
        metadata: {
          lead_id: leadId,
          conversation_id: conversationId,
          error: supersedeError.message,
        },
        source: "lib/coach/generate-suggestion",
        org_id: orgId,
      })
    }

    const { error: insertError } = await supabase.from("coach_suggestions").insert({
      org_id: orgId,
      conversation_id: conversationId,
      lead_id: leadId,
      message_id: messageId,
      objecao: deteccao.objecao,
      tipo: deteccao.tipo,
      confianca: deteccao.confianca,
      respostas: draft.respostas,
      ancoras: draft.ancoras,
      ancorada: draft.ancorada,
      cuidado: draft.cuidado,
    })

    if (insertError) throw insertError

    logEvent({
      level: "info",
      category: "ai",
      event_type: "LIVE_COACH_SUGGESTED",
      message: `Live Coach sugeriu resposta (${deteccao.tipo})`,
      metadata: {
        lead_id: leadId,
        conversation_id: conversationId,
        tipo: deteccao.tipo,
        confianca: deteccao.confianca,
        ancorada: draft.ancorada,
        ancoras_count: draft.ancoras.length,
        respostas_count: draft.respostas.length,
      },
      source: "lib/coach/generate-suggestion",
      org_id: orgId,
    })
  } catch (err) {
    // Best-effort: NUNCA propaga. O webhook e a Nicole não podem sofrer por isso.
    console.error("[live-coach] failed:", err)
    logEvent({
      level: "error",
      category: "ai",
      event_type: "LIVE_COACH_FAILED",
      message: `Live Coach falhou: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { lead_id: leadId, conversation_id: conversationId, error: String(err) },
      source: "lib/coach/generate-suggestion",
      org_id: orgId,
    })
  }
}
