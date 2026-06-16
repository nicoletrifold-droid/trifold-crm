import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  resolveChannel,
  isWithinWhatsAppWindow,
  WHATSAPP_WINDOW_MS,
} from "@web/lib/broker/dispatch-broker-message"

/**
 * Story 56-1 — Envio de mídia da biblioteca ao lead via WhatsApp Cloud API.
 *
 * POST /api/nicole/media/[id]/send?lead_id=xxx
 *
 * Envia o asset como `image` ou `document` dependendo do `file_type`.
 * Respeita a janela de 24h do WhatsApp (mesmo controle do send-message).
 * Grava em `messages` com role='broker' e metadata.is_media=true.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const leadId = request.nextUrl.searchParams.get("lead_id")
  if (!leadId) {
    return NextResponse.json(
      { success: false, error: "MISSING_LEAD_ID", message: "lead_id obrigatório." },
      { status: 400 }
    )
  }

  // Buscar o asset
  const { data: asset } = await supabase
    .from("agent_media_assets")
    .select("id, title, file_url, file_name, file_type, is_active")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!asset) {
    return NextResponse.json(
      { success: false, error: "ASSET_NOT_FOUND" },
      { status: 404 }
    )
  }
  if (!asset.is_active) {
    return NextResponse.json(
      { success: false, error: "ASSET_INACTIVE", message: "Este arquivo está inativo." },
      { status: 422 }
    )
  }

  // Buscar o lead
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, assigned_broker_id")
    .eq("id", leadId)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return NextResponse.json(
      { success: false, error: "LEAD_NOT_FOUND" },
      { status: 404 }
    )
  }

  const isAdmin = ["admin", "supervisor", "gerente-comercial"].includes(appUser.role)
  if (!isAdmin && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Este lead não está atribuído a você." },
      { status: 403 }
    )
  }

  const channel = resolveChannel(lead.phone)

  // Conversation: buscar ou criar
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("lead_id", leadId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle()

  if (!conversation) {
    const { data: created } = await supabase
      .from("conversations")
      .insert({ org_id: appUser.org_id, lead_id: leadId, channel, status: "active" })
      .select("id, last_message_at")
      .single()
    conversation = created
  }

  if (!conversation) {
    return NextResponse.json(
      { success: false, error: "CONVERSATION_ERROR" },
      { status: 500 }
    )
  }

  let sent = false
  let sendError: string | undefined

  if (channel === "whatsapp") {
    // Verificar janela de 24h
    if (!isWithinWhatsAppWindow(conversation.last_message_at)) {
      return NextResponse.json(
        {
          success: false,
          error: "WHATSAPP_WINDOW_CLOSED",
          message: `Fora da janela de 24h do WhatsApp. Aguarde o lead responder. (${Math.round(WHATSAPP_WINDOW_MS / 3600000)}h)`,
        },
        { status: 422 }
      )
    }

    const admin = createAdminClient()
    const { data: waConfig } = await admin
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", appUser.org_id)
      .eq("status", "active")
      .maybeSingle()

    if (waConfig?.phone_number_id && waConfig?.access_token) {
      try {
        const waBody =
          asset.file_type === "image"
            ? {
                messaging_product: "whatsapp",
                to: lead.phone,
                type: "image",
                image: { link: asset.file_url, caption: asset.title },
              }
            : {
                messaging_product: "whatsapp",
                to: lead.phone,
                type: "document",
                document: {
                  link: asset.file_url,
                  filename: asset.file_name,
                  caption: asset.title,
                },
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

  // Gravar em messages independente do resultado do envio
  const messageContent = `[Mídia] ${asset.title}`
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    org_id: appUser.org_id,
    role: "broker",
    content: messageContent,
    metadata: {
      is_media: true,
      media_asset_id: asset.id,
      media_url: asset.file_url,
      media_type: asset.file_type,
      sent_via_whatsapp: sent,
    },
  })

  return NextResponse.json({
    success: true,
    sent,
    error: sendError,
  })
}
