import { NextRequest, NextResponse } from "next/server"
import { can } from "@web/lib/permissions"
import { requireAuth } from "@web/lib/api-auth"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"
import { uploadInboundMedia } from "@web/lib/media/inbound-media"
import { transcribeAudio } from "@web/lib/transcription/transcribe"
import {
  alertCredencialMorta,
  isCredencialMorta,
} from "@web/lib/meta/alert-credencial-morta"

/**
 * Story 75-289 (AC4, 2ª parte) — baixa de novo a mídia que o lead mandou e não chegou.
 *
 * A 1ª parte da AC4 só gravou o `media_id` e marcou a falha no banco: a tela não
 * contava nada (a bolha ficava "🎤 Mensagem de voz" em cinza, indistinguível de
 * "ainda baixando") e ninguém tinha como reagir. Esta rota é a ação que faltava.
 *
 * Cobre os DOIS estados de mídia quebrada que existem em produção hoje:
 *
 *  1. **Não baixou** (`media_url` nulo + `media_id` presente): busca na Graph API,
 *     sobe ao bucket e, sendo áudio, transcreve. A Meta retém a mídia ~30 dias — é
 *     essa janela que o `media_id` persistido abre.
 *  2. **Baixou mas não transcreveu** (`media_url` presente, `transcribed` false):
 *     acontece quando o Whisper falha (a transcrição é fail-open de propósito, para
 *     não perder a mensagem). Aqui o arquivo já é nosso: só transcreve de novo.
 *
 * Áudio SEM transcrição não é uma mensagem perdida — o corretor consegue ouvir. Mas a
 * Nicole fica cega, porque o que alimenta a IA é o texto.
 *
 * Idempotente: rodar duas vezes não duplica mensagem nem cria mídia órfã (o segundo
 * download simplesmente sobrescreve `media_url` por um arquivo equivalente).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const isPrivileged = await can(appUser.id, appUser.org_id, "conversas.enviar_qualquer")
  const db = isPrivileged ? createOrgScopedAdminClient(appUser.org_id) : supabase

  const { data: lead } = await db
    .from("leads")
    .select("id, assigned_broker_id")
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

  // A mensagem precisa pertencer a uma conversa DESTE lead — senão um id de mensagem
  // de outro lead teria sua mídia baixada e exposta aqui.
  const admin = createOrgScopedAdminClient(appUser.org_id)
  const { data: msg } = await admin
    .from("messages")
    .select("id, role, content, media_url, media_type, metadata, conversation_id, conversations!inner(lead_id)")
    .eq("id", messageId)
    .eq("conversations.lead_id", id)
    .maybeSingle()

  if (!msg) {
    return NextResponse.json({ success: false, error: "MESSAGE_NOT_FOUND" }, { status: 404 })
  }

  const metadata = (msg.metadata as Record<string, unknown> | null) ?? {}
  const mediaId = metadata.media_id as string | undefined
  const mediaType = (msg.media_type as string | null) ?? (metadata.media_type as string | undefined)
  const isAudio = mediaType === "voice" || mediaType === "audio"
  const jaTranscrito = metadata.transcribed === true

  if (!mediaType) {
    return NextResponse.json(
      { success: false, error: "NOT_MEDIA", message: "Esta mensagem não tem mídia." },
      { status: 409 }
    )
  }

  // Nada a fazer: já tem arquivo e (se áudio) já tem texto.
  if (msg.media_url && (!isAudio || jaTranscrito)) {
    return NextResponse.json(
      { success: false, error: "NOTHING_TO_DO", message: "Esta mídia já está completa." },
      { status: 409 }
    )
  }

  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("access_token")
    .eq("org_id", appUser.org_id)
    .eq("status", "active")
    .maybeSingle()

  const token = waConfig?.access_token as string | undefined

  let mediaUrl = (msg.media_url as string | null) ?? null
  let buffer: ArrayBuffer | null = null
  let mimeType = isAudio ? "audio/ogg" : "application/octet-stream"

  // --- Caso 1: não baixou. Precisa do media_id + credencial viva. ---
  if (!mediaUrl) {
    if (!mediaId) {
      // Mídia recebida ANTES desta story: o id nunca foi gravado e a Meta não tem
      // como devolvê-la a partir do wamid. Irrecuperável — e é o motivo de o
      // `media_id` passar a ser persistido.
      return NextResponse.json(
        {
          success: false,
          error: "NO_MEDIA_ID",
          message:
            "Esta mídia é anterior à correção e não guardou o identificador da Meta — não há como recuperá-la.",
        },
        { status: 410 }
      )
    }
    if (!token) {
      return NextResponse.json(
        { success: false, error: "WHATSAPP_CONFIG_MISSING" },
        { status: 400 }
      )
    }

    try {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!metaRes.ok) {
        const erro = `graph HTTP ${metaRes.status}`
        if (isCredencialMorta({ status: metaRes.status })) {
          await alertCredencialMorta({
            orgId: appUser.org_id,
            credencial: "whatsapp_config",
            detalhe: `nova tentativa de baixar mídia falhou: ${erro}`,
          })
        }
        // 404 aqui normalmente = passaram os ~30 dias de retenção da Meta.
        return NextResponse.json(
          {
            success: false,
            error: metaRes.status === 404 ? "MEDIA_EXPIRED" : erro,
            message:
              metaRes.status === 404
                ? "A Meta já descartou esta mídia (retenção de ~30 dias)."
                : "A Meta recusou a busca da mídia.",
          },
          { status: 502 }
        )
      }
      const metaJson = (await metaRes.json()) as { url?: string; mime_type?: string }
      if (!metaJson.url) {
        return NextResponse.json({ success: false, error: "MEDIA_URL_MISSING" }, { status: 502 })
      }

      const fileRes = await fetch(metaJson.url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      })
      if (!fileRes.ok) {
        return NextResponse.json(
          { success: false, error: `arquivo HTTP ${fileRes.status}` },
          { status: 502 }
        )
      }
      buffer = await fileRes.arrayBuffer()
      mimeType = metaJson.mime_type || fileRes.headers.get("content-type") || mimeType
      mediaUrl = await uploadInboundMedia(admin, buffer, mimeType, id)
      if (!mediaUrl) {
        return NextResponse.json({ success: false, error: "UPLOAD_FAILED" }, { status: 500 })
      }
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "DOWNLOAD_FAILED",
        },
        { status: 502 }
      )
    }
  }

  // --- Caso 2: áudio sem transcrição. Se não baixamos agora, lê do bucket. ---
  let transcricao: string | null = null
  if (isAudio && !jaTranscrito) {
    if (!buffer && mediaUrl) {
      try {
        const stored = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) })
        if (stored.ok) {
          buffer = await stored.arrayBuffer()
          mimeType = stored.headers.get("content-type") || mimeType
        }
      } catch (err) {
        console.error("[75-289] leitura do áudio no bucket falhou:", err)
      }
    }
    if (buffer) transcricao = await transcribeAudio(buffer, mimeType)
  }

  const novoMetadata: Record<string, unknown> = {
    ...metadata,
    media_url: mediaUrl,
    media_download_failed: false,
    media_recovered_at: new Date().toISOString(),
    ...(isAudio ? { transcribed: jaTranscrito || !!transcricao } : {}),
  }
  delete novoMetadata.media_download_error

  await admin
    .from("messages")
    .update({
      media_url: mediaUrl,
      media_type: mediaType,
      metadata: novoMetadata,
      // Só sobrescreve o conteúdo quando há transcrição NOVA — nunca apaga texto.
      ...(transcricao ? { content: transcricao } : {}),
    })
    .eq("id", messageId)

  return NextResponse.json({
    success: true,
    mediaUrl,
    transcrito: !!transcricao,
    // A Nicole é alimentada pelo texto; sem transcrição o corretor ainda pode ouvir.
    message: transcricao
      ? "Mídia recuperada e transcrita."
      : "Mídia recuperada. A transcrição não veio — dá para ouvir o áudio.",
  })
}
