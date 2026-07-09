// Persistência de mídia recebida (imagem/documento/voz) de lead/cliente.
//
// Sobe o arquivo ao bucket `nicole-media` e devolve a URL pública — o chamador grava
// essa URL em `messages.metadata.media_url` (a UI já renderiza player/imagem/link a
// partir de media_type + media_url, ver components/conversas/message-media.tsx).
//
// DEFENSIVO: nunca lança. Retorna a URL ou `null` — falha NUNCA quebra o inbound/IA.
//
// Extraído de `persistInboundMedia` (Story 75-85, webhook WhatsApp) p/ reuso entre
// canais (WhatsApp, Telegram, portal do cliente).

import type { SupabaseClient } from "@supabase/supabase-js"
import crypto from "crypto"

const BUCKET = "nicole-media"

export type InboundMediaType = "image" | "document" | "voice"

/**
 * Sobe um buffer de mídia recebida ao bucket e devolve a URL pública.
 *
 * @param admin     Supabase admin client (service role)
 * @param buffer    bytes do arquivo
 * @param mimeType  MIME (define a extensão do arquivo)
 * @param leadId    id do lead (usado no path p/ organizar)
 * @returns URL pública do arquivo, ou `null` em caso de falha
 */
export async function uploadInboundMedia(
  admin: SupabaseClient,
  buffer: ArrayBuffer,
  mimeType: string,
  leadId: string
): Promise<string | null> {
  try {
    const ext = (mimeType.split("/")[1] || "bin").split(";")[0]
    const path = `inbound/${leadId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(buffer), { contentType: mimeType, upsert: false })
    if (upErr) {
      console.error("[inbound-media] upload falhou (ignorado):", upErr.message)
      return null
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    return pub?.publicUrl ?? null
  } catch (e) {
    console.error("[inbound-media] erro (ignorado):", e)
    return null
  }
}
