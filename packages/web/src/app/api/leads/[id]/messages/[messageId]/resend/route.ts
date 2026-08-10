import { NextRequest, NextResponse, after } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  dispatchBrokerMessage,
  resolveChannel,
} from "@web/lib/broker/dispatch-broker-message"
import { buildSignedMessage } from "@web/lib/broker/message-signature"
import {
  alertCredencialMorta,
  isCredencialMorta,
} from "@web/lib/meta/alert-credencial-morta"

/**
 * Story 75-289 (AC2) — reenvia uma mensagem do corretor que NÃO chegou ao lead.
 *
 * Por que um endpoint próprio em vez de reusar o `send-message`: reenviar pelo
 * fluxo normal criaria uma SEGUNDA linha em `messages` e o corretor veria a mesma
 * frase duas vezes na conversa. Aqui a MESMA mensagem é reaproveitada — em caso de
 * sucesso o `send_error` sai do metadata e a bolha volta a ser normal.
 *
 * Só mexe em mensagem `role='broker'` que tenha `metadata.send_error`: não existe
 * "reenviar" para mensagem entregue, do lead ou da Nicole.
 *
 * Reusa integralmente as réguas do `send-message`: mesmo gate de acesso, mesma
 * assinatura do remetente (75-171), mesma checagem de janela de 24h (dentro do
 * `dispatchBrokerMessage`) e o mesmo alerta de credencial morta (AC3).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const isPrivileged = [
    "admin",
    "supervisor",
    "gerente-comercial",
    "sdr",
    "gerente-relacionamento",
  ].includes(appUser.role)
  const db = isPrivileged ? createAdminClient() : supabase

  const { data: lead } = await db
    .from("leads")
    .select("id, phone, assigned_broker_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return NextResponse.json({ success: false, error: "LEAD_NOT_FOUND" }, { status: 404 })
  }
  if (!isPrivileged && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Este lead não está atribuído a você." },
      { status: 403 }
    )
  }

  const { data: conversation } = await db
    .from("conversations")
    .select("id, last_message_at")
    .eq("lead_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle()

  if (!conversation) {
    return NextResponse.json({ success: false, error: "CONVERSATION_NOT_FOUND" }, { status: 404 })
  }

  // A mensagem precisa pertencer A ESTA conversa — sem isso, um id de mensagem de
  // outro lead seria reenviado para o telefone deste (vazamento entre conversas).
  const admin = createAdminClient()
  const { data: msg } = await admin
    .from("messages")
    .select("id, role, content, metadata, conversation_id")
    .eq("id", messageId)
    .eq("conversation_id", conversation.id)
    .maybeSingle()

  if (!msg) {
    return NextResponse.json({ success: false, error: "MESSAGE_NOT_FOUND" }, { status: 404 })
  }

  const metadata = (msg.metadata as Record<string, unknown> | null) ?? {}
  if (msg.role !== "broker" || typeof metadata.send_error !== "string") {
    return NextResponse.json(
      {
        success: false,
        error: "NOT_RESENDABLE",
        message: "Só mensagens do corretor que falharam podem ser reenviadas.",
      },
      { status: 409 }
    )
  }

  // --- Reenvio, com as mesmas credenciais e réguas do envio original ---
  const channel = resolveChannel(lead.phone)
  let waCredentials: { phoneNumberId: string; accessToken: string } | null = null
  if (channel === "whatsapp") {
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

  // `content` guarda o texto ORIGINAL (75-171) — a assinatura é reaplicada aqui.
  // CRÍTICO: assina com quem ESCREVEU (`metadata.signed_as`), não com quem clicou
  // reenviar. No atendimento compartilhado um supervisor pode reenviar a mensagem
  // da corretora, e o lead receberia a fala dela assinada com o nome dele.
  const assinante = (metadata.signed_as as string | undefined) ?? appUser.name
  const dispatch = await dispatchBrokerMessage({
    phone: lead.phone as string,
    message: buildSignedMessage(assinante, msg.content as string, channel),
    conversationLastMessageAt: conversation.last_message_at as string | null,
    waCredentials,
  })

  if (!dispatch.sent) {
    if (isCredencialMorta({ error: dispatch.error })) {
      after(() =>
        alertCredencialMorta({
          orgId: appUser.org_id,
          credencial: "whatsapp_config",
          detalhe: `reenvio do corretor falhou: ${dispatch.error}`,
        }).catch((err) => console.error("[75-289] alerta de credencial falhou:", err)),
      )
    }
    // Registra a nova tentativa sem apagar o histórico: a bolha segue "não entregue".
    await admin
      .from("messages")
      .update({
        metadata: {
          ...metadata,
          send_error: dispatch.error ?? "SEND_FAILED",
          resend_attempted_at: new Date().toISOString(),
        },
      })
      .eq("id", messageId)

    return NextResponse.json(
      { success: false, error: dispatch.error ?? "SEND_FAILED" },
      { status: 502 }
    )
  }

  // Sucesso: o `send_error` SAI do metadata (é o que faz a bolha voltar ao normal).
  const { send_error: _removido, ...limpo } = metadata
  await admin
    .from("messages")
    .update({
      metadata: { ...limpo, sent_via: channel, resent_at: new Date().toISOString() },
    })
    .eq("id", messageId)

  return NextResponse.json({ success: true, channel })
}
