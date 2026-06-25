import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-62 (Passo 2) — Log de disparos de TEMPLATE de WhatsApp (os que custam
 * na Meta). Chamado após cada envio de template; deriva o custo via tabela
 * `whatsapp_pricing`. Fire-and-forget: NUNCA quebra o envio (swallow + console).
 * Mensagens de service/freeform (janela 24h, grátis) NÃO passam por aqui.
 */

export type WaCategory = "utility" | "marketing" | "authentication" | "service"

export interface WaSendLogInput {
  orgId: string
  template?: string | null
  category: WaCategory
  recipientType?: string | null
  toPhone?: string | null
  status?: "sent" | "failed"
  error?: string | null
  wamId?: string | null
}

export async function logWhatsappSend(
  admin: SupabaseClient,
  input: WaSendLogInput
): Promise<void> {
  try {
    await admin.from("whatsapp_send_log").insert({
      org_id: input.orgId,
      template: input.template ?? null,
      category: input.category,
      recipient_type: input.recipientType ?? null,
      to_phone: input.toPhone ?? null,
      status: input.status ?? "sent",
      error: input.error ?? null,
      wam_id: input.wamId ?? null,
    })
  } catch (e) {
    console.error("[whatsapp] logWhatsappSend falhou (ignorado)", e)
  }
}
