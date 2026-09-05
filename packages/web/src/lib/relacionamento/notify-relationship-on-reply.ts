import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUser } from "@web/lib/server/push-service"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"

// Story 75-86 — Push aos gerentes de relacionamento (Samara) quando um cliente
// responde numa conversa JÁ marcada como relacionamento (o 1º roteamento da Nicole
// já notifica; isto cobre as mensagens seguintes). Disparado no webhook do WhatsApp.
//
// Push-only (sendPushToUser direto — sem email/WhatsApp). Best-effort: NUNCA lança;
// uma falha aqui não pode afetar o webhook/pipeline.


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

    // Story 900-66 (AC4) — o push É um deep link para a conversa; sem URL base ele não sai.
    const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "lib/relacionamento/notify-relationship-on-reply", {
      orgId,
      conversationId,
    })
    if (!base.ok) return
    const payload = buildRelationshipPushPayload({ contactName, messageExcerpt, appUrl: base.url, conversationId })
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
