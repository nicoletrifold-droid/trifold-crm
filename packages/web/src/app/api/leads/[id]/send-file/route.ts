import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  resolveChannel,
  isWithinWhatsAppWindow,
  WHATSAPP_WINDOW_MS,
} from "@web/lib/broker/dispatch-broker-message"

/**
 * Story 75-12 — Envio de arquivo do COMPUTADOR do corretor ao lead via WhatsApp.
 *
 * POST /api/leads/[id]/send-file  (multipart: file, caption?)
 *
 * Faz upload para o bucket público `nicole-media` sob `broker-chat/{leadId}/` e
 * envia por link (image p/ jpeg/png, senão document). Respeita a janela de 24h
 * e grava em `messages`. Limite de 4 MB (teto de body do serverless).
 */
const MAX_BYTES = 4 * 1024 * 1024
const BUCKET = "nicole-media"
const IMAGE_TYPES = ["image/jpeg", "image/png"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Story 76-4 — grupo privilegiado (inclui gerente-relacionamento p/ o Chat) lê/escreve
  // via ADMIN client (a RLS de leads/conversations não passa a gerente-relacionamento;
  // p/ admin/supervisor/gerente-comercial é neutro). Corretor → client de sessão.
  // 75-310: enviar em lead de terceiros é a capability conversas.enviar_qualquer.
  const isPrivileged = await can(appUser.id, appUser.org_id, "conversas.enviar_qualquer")
  const db = isPrivileged ? createAdminClient() : supabase

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_FORM", message: "Envio inválido." },
      { status: 400 }
    )
  }

  const file = formData.get("file")
  const caption = (formData.get("caption") as string | null)?.trim() || ""

  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "MISSING_FILE", message: "Selecione um arquivo." },
      { status: 400 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "FILE_TOO_LARGE", message: "Arquivo muito grande (máx. 4 MB)." },
      { status: 400 }
    )
  }

  // Lead + ownership
  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone, assigned_broker_id")
    .eq("id", leadId)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return NextResponse.json({ success: false, error: "LEAD_NOT_FOUND" }, { status: 404 })
  }

  const isAdmin = isPrivileged
  if (!isAdmin && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Este lead não está atribuído a você." },
      { status: 403 }
    )
  }

  const channel = resolveChannel(lead.phone)

  // Conversation: buscar ou criar
  let { data: conversation } = await db
    .from("conversations")
    .select("id, last_message_at")
    .eq("lead_id", leadId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle()

  if (!conversation) {
    const { data: created } = await db
      .from("conversations")
      .insert({ org_id: appUser.org_id, lead_id: leadId, channel, status: "active" })
      .select("id, last_message_at")
      .single()
    conversation = created
  }
  if (!conversation) {
    return NextResponse.json({ success: false, error: "CONVERSATION_ERROR" }, { status: 500 })
  }

  // Janela de 24h (somente WhatsApp)
  if (channel === "whatsapp" && !isWithinWhatsAppWindow(conversation.last_message_at)) {
    return NextResponse.json(
      {
        success: false,
        error: "WHATSAPP_WINDOW_CLOSED",
        message: `Fora da janela de 24h do WhatsApp. Aguarde o lead responder. (${Math.round(WHATSAPP_WINDOW_MS / 3600000)}h)`,
      },
      { status: 422 }
    )
  }

  // Upload para o bucket público (admin client bypassa RLS de storage)
  const admin = createAdminClient()
  const ext = file.name.includes(".") ? file.name.split(".").pop() : ""
  const storagePath = `broker-chat/${leadId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(bytes), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
  if (uploadError) {
    return NextResponse.json(
      { success: false, error: "UPLOAD_FAILED", message: uploadError.message },
      { status: 500 }
    )
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath)
  const fileUrl = pub.publicUrl
  const isImage = IMAGE_TYPES.includes(file.type)
  // Áudio (mensagem de voz). WhatsApp toca OGG/Opus como voz; o composer grava
  // nesse formato (opus-recorder). type:audio NÃO aceita caption na Cloud API.
  const isAudio = file.type.startsWith("audio/")

  // Envio via WhatsApp Cloud API
  let sent = false
  let sendError: string | undefined

  if (channel === "whatsapp") {
    const { data: waConfig } = await admin
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", appUser.org_id)
      .eq("status", "active")
      .maybeSingle()

    if (waConfig?.phone_number_id && waConfig?.access_token) {
      try {
        const waBody = isAudio
          ? {
              messaging_product: "whatsapp",
              to: lead.phone,
              type: "audio",
              audio: { link: fileUrl },
            }
          : isImage
          ? {
              messaging_product: "whatsapp",
              to: lead.phone,
              type: "image",
              image: { link: fileUrl, caption: caption || undefined },
            }
          : {
              messaging_product: "whatsapp",
              to: lead.phone,
              type: "document",
              document: { link: fileUrl, filename: file.name, caption: caption || undefined },
            }

        const res = await fetch(
          `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${waConfig.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(waBody),
            signal: AbortSignal.timeout(15000),
          }
        )
        sent = res.ok
        if (!res.ok) sendError = `HTTP_${res.status}`
      } catch {
        sendError = "TIMEOUT"
      }
    } else {
      sendError = "WHATSAPP_CONFIG_MISSING"
    }
  }

  // Grava em messages independente do resultado do envio externo.
  // NOTA: `messages` NÃO tem coluna `org_id` (o isolamento de org é via
  // conversation_id → conversations.org_id, inclusive na RLS). Setar org_id aqui
  // fazia o insert falhar ("column does not exist") silenciosamente (Story 75-40).
  const mediaType = isAudio ? "audio" : isImage ? "image" : "document"
  const { data: insertedMsg, error: insertErr } = await db
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "broker",
      content: isAudio
        ? "[Áudio]"
        : caption
        ? `[Arquivo] ${file.name} — ${caption}`
        : `[Arquivo] ${file.name}`,
      media_url: fileUrl,
      media_type: mediaType,
      metadata: {
        is_media: true,
        media_url: fileUrl,
        media_type: mediaType,
        file_name: file.name,
        sent_via_whatsapp: sent,
        source: "broker_upload",
      },
    })
    .select("id")
    .single()

  // Não falhar em silêncio: o WhatsApp pode ter sido enviado, mas se não gravou
  // no histórico precisamos saber (log + resposta de erro).
  if (insertErr || !insertedMsg) {
    console.error(
      `[send-file] insert em messages falhou (lead=${leadId}): ${insertErr?.message}`
    )
    return NextResponse.json(
      { success: false, error: "MESSAGE_INSERT_FAILED", message: insertErr?.message, sent },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, sent, error: sendError, messageId: insertedMsg.id })
}
