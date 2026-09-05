import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUser } from "@web/lib/server/push-service"
import { brokerSentRecently } from "@web/lib/broker/broker-takeover-status"
import { leadDeepLink } from "@web/lib/leads/lead-url"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"

/**
 * Story 63-12 (Epic 63) — Push ao corretor quando o lead responde + deep-link.
 *
 * Disparado pelo webhook do WhatsApp (`api/webhook/whatsapp/route.ts`) dentro de
 * um `after()` (fire-and-forget) logo após o INSERT da mensagem inbound do lead.
 *
 * Decisões de produto (@po, 2026-06-21):
 *  - **Q1 (gatilho):** só notifica quando o corretor JÁ ASSUMIU a conversa —
 *    `assigned_broker_id` não-null E há `role='broker'` nas últimas 24h
 *    (`brokerSentRecently`, mesma fonte-de-verdade do banner 63-8 e do cron de
 *    follow-up). A flag `notify_broker_on_reply` (63-10) NÃO é gate.
 *  - **Q2 (anti-spam):** SEM debounce — 1 push por mensagem inbound. NÃO grava
 *    nem lê `metadata.last_reply_push_at`; `leads.metadata` não é tocado.
 *  - **Q3 (sem corretor):** `assigned_broker_id` null → não notifica ninguém,
 *    sem fallback gerente/admin (diferente de `notify-stalled-lead.ts`).
 *
 * Push-only: usa `sendPushToUser` diretamente (não `notifyBroker`, que enviaria
 * push+email+WhatsApp — spam por mensagem). O deep-link `url=/broker/leads/{id}`
 * é lido pelo service worker (`sw-source.js`, NÃO modificado).
 *
 * CON-1: nenhum `tel:`/`wa.me`. CON-3/CON-7: não toca `is_ai_active` nem estado
 * de atendimento — é notificação pura.
 *
 * Best-effort: NUNCA lança. Uma falha aqui não pode afetar o webhook nem o
 * pipeline da Nicole (que roda em `after()` independente).
 */
export interface NotifyOnReplyParams {
  /** Admin client recebido por parâmetro (facilita testes). */
  supabase: SupabaseClient
  leadId: string
  /** Conversa onde o inbound foi inserido — usada no gate Q1. */
  conversationId: string
  orgId: string
  /** Texto da mensagem inbound (pode ser vazio para mídia sem legenda). */
  messageExcerpt: string
}

/** Janela do gate Q1: 24h (mesma de `brokerSentRecently`/63-8). */
const TAKEOVER_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Monta o payload do push (helper puro, testável). `title` usa o nome do lead
 * (ou "Lead"); `body` usa os primeiros 100 chars da mensagem (ou um fallback
 * para mídia sem texto); `url` é o deep-link interno lido pelo service worker.
 */
export function buildReplyPushPayload(args: {
  leadName: string | null
  messageExcerpt: string
  appUrl: string
  leadId: string
  /** Role do dono do lead — Story 75-226: SDR recebe deep link do /dashboard. */
  ownerRole?: string | null
}): { title: string; body: string; url: string } {
  const { leadName, messageExcerpt, appUrl, leadId, ownerRole } = args
  return {
    title: `${leadName ?? "Lead"} respondeu`,
    body: messageExcerpt.slice(0, 100) || "Nova mensagem recebida.",
    url: leadDeepLink(appUrl, ownerRole, leadId),
  }
}

export async function notifyBrokerOnReply(
  params: NotifyOnReplyParams
): Promise<void> {
  try {
    const { supabase, leadId, conversationId, orgId, messageExcerpt } = params

    // 1. Dados do lead — assigned_broker_id (gate Q3) + nome (copy do push).
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, assigned_broker_id, owner:users!assigned_broker_id(role)")
      .eq("id", leadId)
      .eq("org_id", orgId)
      .maybeSingle()

    // Q3 — sem corretor atribuído → não notifica ninguém (sem fallback).
    if (!lead?.assigned_broker_id) return

    // 2. Q1 — o corretor JÁ ASSUMIU? (role='broker' nas últimas 24h na conversa).
    //    A query já restringe role+janela; `brokerSentRecently` reaplica a mesma
    //    janela em memória reusando o helper canônico (63-8).
    const since = new Date(Date.now() - TAKEOVER_WINDOW_MS).toISOString()
    const { data: brokerMsgs } = await supabase
      .from("messages")
      .select("role, created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "broker")
      .gte("created_at", since)
      .limit(1)

    // Nicole ainda conduz sozinha (sem broker recente) → não notificar.
    if (!brokerSentRecently(brokerMsgs ?? [])) return

    // 3. Enviar push (Q2 — sem debounce: 1 push por inbound; sem mutar metadata).
    // Story 900-66 (AC4) — o push É um deep link para a conversa; sem URL base ele não sai.
    const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "lib/broker/notify-on-reply", { leadId })
    if (!base.ok) return
    const appUrl = base.url
    const owner = Array.isArray(lead.owner) ? lead.owner[0] : lead.owner
    const payload = buildReplyPushPayload({
      leadName: (lead.name as string | null) ?? null,
      messageExcerpt,
      appUrl,
      leadId,
      ownerRole: (owner as { role?: string } | null)?.role ?? null,
    })
    await sendPushToUser(supabase, lead.assigned_broker_id as string, payload)
  } catch (err) {
    // Best-effort: nunca propaga erro para não afetar o webhook/Nicole.
    console.error("[notify-on-reply] failed:", err)
  }
}
