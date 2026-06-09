import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  dispatchBrokerMessage,
  resolveChannel,
} from "@web/lib/broker/dispatch-broker-message"
import {
  buildTransitionText,
  shouldSendTransition,
} from "@web/lib/broker/transition-message"

const MAX_MESSAGE_LENGTH = 4096 // Limite do WhatsApp

/**
 * Story 51-1 (Epic 51) — Chat bidirecional do corretor.
 *
 * POST /api/leads/[id]/send-message
 * Body: { message: string }
 *
 * Envia uma mensagem do corretor ao lead pelo canal correto (Telegram ou
 * WhatsApp Cloud API) e grava em `messages` com `role='broker'`. Ao gravar
 * `role='broker'`, o cron followup (`brokerSentRecently`) detecta o takeover
 * de 24h automaticamente — a Nicole pausa sem lógica adicional (AC6).
 *
 * REGRA DE NEGÓCIO: NÃO desliga `is_ai_active`. O takeover é controlado pela
 * janela de 24h do cron, não por flag de agendamento.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // --- Validação do payload (AC8) ---
  const body = await request.json().catch(() => null)
  const rawMessage = body?.message
  if (typeof rawMessage !== "string") {
    return NextResponse.json(
      { success: false, error: "INVALID_BODY", message: "Campo 'message' obrigatório." },
      { status: 400 }
    )
  }
  const message = rawMessage.trim()
  if (message.length === 0) {
    return NextResponse.json(
      { success: false, error: "EMPTY_MESSAGE", message: "A mensagem não pode estar vazia." },
      { status: 400 }
    )
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: "MESSAGE_TOO_LONG",
        message: `A mensagem excede o limite de ${MAX_MESSAGE_LENGTH} caracteres.`,
      },
      { status: 400 }
    )
  }

  // --- Lead + validação de ownership (RLS já filtra por org; checagem explícita de broker) ---
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, assigned_broker_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return NextResponse.json(
      { success: false, error: "LEAD_NOT_FOUND" },
      { status: 404 }
    )
  }

  const isAdmin = ["admin", "supervisor", "gerente-comercial"].includes(appUser.role)
  if (!isAdmin) {
    // Corretor só pode enviar para o próprio lead. `leads.assigned_broker_id`
    // armazena o user_id do corretor (ver RLS migration 085 e broker page,
    // que filtra `.eq("assigned_broker_id", user.id)`).
    if (lead.assigned_broker_id !== appUser.id) {
      return NextResponse.json(
        { success: false, error: "FORBIDDEN", message: "Este lead não está atribuído a você." },
        { status: 403 }
      )
    }
  }

  // --- Conversation (AC2 / R3: criar se não existir) ---
  const channel = resolveChannel(lead.phone)
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("lead_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle()

  if (!conversation) {
    const { data: created, error: createErr } = await supabase
      .from("conversations")
      .insert({
        org_id: appUser.org_id,
        lead_id: id,
        channel,
        status: "active",
      })
      .select("id, last_message_at")
      .single()

    if (createErr || !created) {
      return NextResponse.json(
        { success: false, error: "CONVERSATION_CREATE_FAILED", message: createErr?.message },
        { status: 500 }
      )
    }
    conversation = created
  }

  // --- Resolver credenciais WhatsApp (whatsapp_config por org_id; admin p/ bypass RLS de token) ---
  let waCredentials: { phoneNumberId: string; accessToken: string } | null = null
  if (channel === "whatsapp") {
    const admin = createAdminClient()
    const { data: waConfig } = await admin
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", appUser.org_id)
      .eq("status", "active")
      .maybeSingle()

    if (waConfig?.phone_number_id && waConfig?.access_token) {
      waCredentials = {
        phoneNumberId: waConfig.phone_number_id,
        accessToken: waConfig.access_token,
      }
    }
  }

  // --- Story 51-2: mensagem de transição na 1ª mensagem do corretor (AC1–AC4) ---
  // Detecta "1ª mensagem": não existe nenhuma mensagem `role='broker'` nesta
  // conversa antes do insert atual. A transição é gravada com `role='assistant'`
  // + metadata.is_transition (AUTO-DECISION 51-2), portanto NÃO se conta a si
  // mesma — apenas mensagens role='broker' marcam a conversa como assumida.
  const { data: existingBrokerMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .eq("role", "broker")
    .limit(1)
    .maybeSingle()

  if (shouldSendTransition(existingBrokerMsg)) {
    // Envia ANTES da mensagem do corretor para o lead ver a transição primeiro.
    // Falha silenciosa: nunca bloqueia a mensagem principal do corretor (AC4).
    try {
      const transitionText = buildTransitionText(lead.name, appUser.name)

      const transitionDispatch = await dispatchBrokerMessage({
        phone: lead.phone,
        message: transitionText,
        conversationLastMessageAt: conversation.last_message_at,
        waCredentials,
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
      })

      if (!transitionDispatch.sent) {
        console.error(
          `[send-message] transição falhou (lead=${id}, channel=${channel}): ${transitionDispatch.error}`
        )
      }

      // Grava a transição em messages independentemente do envio externo, para
      // manter o histórico consistente e garantir a idempotência (AC3): mesmo
      // com falha de envio, a conversa registra que a apresentação ocorreu.
      const { error: transitionInsertErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: transitionText,
          metadata: {
            is_transition: true,
            broker_id: appUser.id,
            ...(transitionDispatch.sent
              ? { sent_via: channel }
              : { send_error: transitionDispatch.error ?? "SEND_FAILED" }),
          },
        })

      if (transitionInsertErr) {
        console.error(
          `[send-message] insert da transição falhou (lead=${id}): ${transitionInsertErr.message}`
        )
      }
    } catch (err) {
      // Garantia extra: qualquer erro inesperado na transição não pode impedir
      // o envio da mensagem do corretor (AC4).
      console.error(
        `[send-message] erro inesperado na transição (lead=${id}):`,
        err
      )
    }
  }

  // --- Dispatch (verifica janela 24h internamente p/ WhatsApp; AC3/AC4) ---
  const dispatch = await dispatchBrokerMessage({
    phone: lead.phone,
    message,
    conversationLastMessageAt: conversation.last_message_at,
    waCredentials,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
  })

  // Janela do WhatsApp fechada → NÃO grava, informa o corretor (AC3)
  if (!dispatch.sent && dispatch.error === "WHATSAPP_WINDOW_CLOSED") {
    return NextResponse.json(
      {
        success: false,
        error: "WHATSAPP_WINDOW_CLOSED",
        message:
          "Fora da janela de 24h do WhatsApp. Use um template aprovado ou aguarde o lead responder.",
      },
      { status: 409 }
    )
  }

  // --- Gravar em messages com role='broker' (AC2). Em falha de envio externo,
  // grava mesmo assim com metadata.send_error (AC7). ---
  if (!dispatch.sent) {
    console.error(
      `[send-message] dispatch falhou (lead=${id}, channel=${channel}): ${dispatch.error}`
    )
  }

  const metadata: Record<string, unknown> = {
    sent_via: channel,
    sent_by: appUser.id,
  }
  if (!dispatch.sent) {
    metadata.send_error = dispatch.error ?? "SEND_FAILED"
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "broker",
      content: message,
      metadata,
    })
    .select("id")
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json(
      { success: false, error: "MESSAGE_INSERT_FAILED", message: insertErr?.message },
      { status: 500 }
    )
  }

  // `conversations.last_message_at` é atualizado pelo trigger trg_messages_update_conv.

  return NextResponse.json({
    success: true,
    messageId: inserted.id,
    sent: dispatch.sent,
    channel,
    ...(dispatch.sent ? {} : { sendError: dispatch.error }),
  })
}
