import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUser } from "@web/lib/server/push-service"

// Story 75-86 — Push aos gerentes de relacionamento (Samara) quando um cliente
// responde numa conversa JÁ marcada como relacionamento (o 1º roteamento da Nicole
// já notifica; isto cobre as mensagens seguintes). Disparado no webhook do WhatsApp.
//
// Push-only (sendPushToUser direto — sem email/WhatsApp). Best-effort: NUNCA lança;
// uma falha aqui não pode afetar o webhook/pipeline.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

export interface NotifyRelationshipParams {
  /** Admin client por parâmetro (facilita testes). */
  supabase: SupabaseClient
  conversationId: string
  orgId: string
  contactName: string | null
  /** Texto da mensagem inbound (pode ser vazio p/ mídia). */
  messageExcerpt: string
}

export function buildRelationshipPushPayload(args: {
  contactName: string | null
  messageExcerpt: string
  appUrl: string
  conversationId: string
}): { title: string; body: string; url: string } {
  const { contactName, messageExcerpt, appUrl, conversationId } = args
  return {
    title: `${contactName ?? "Cliente"} respondeu`,
    body: messageExcerpt.slice(0, 100) || "Nova mensagem no relacionamento.",
    url: `${appUrl}/dashboard/chat/${conversationId}`,
  }
}

export async function notifyRelationshipOnReply(
  params: NotifyRelationshipParams
): Promise<void> {
  try {
    const { supabase, conversationId, orgId, contactName, messageExcerpt } = params

    const { data: managers } = await supabase
      .from("users")
      .select("id")
      .eq("org_id", orgId)
      .eq("role", "gerente-relacionamento")
      .eq("is_active", true)

    if (!managers?.length) return

    const payload = buildRelationshipPushPayload({ contactName, messageExcerpt, appUrl: APP_URL, conversationId })
    await Promise.all(
      (managers as Array<{ id: string }>).map((m) =>
        sendPushToUser(supabase, m.id, payload).catch((e: unknown) =>
          console.error("[75-86] push relacionamento falhou:", e)
        )
      )
    )
  } catch (e) {
    console.error("[75-86] notifyRelationshipOnReply (ignorado):", e)
  }
}
