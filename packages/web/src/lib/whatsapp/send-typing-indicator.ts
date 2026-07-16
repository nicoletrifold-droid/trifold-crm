/**
 * Story 75-156 — Indicador "digitando…" no WhatsApp do lead (humanização da Nicole).
 *
 * A Meta WhatsApp Cloud API (Graph v21.0) só expõe o typing indicator como
 * REAÇÃO a uma mensagem recebida: o POST vai junto de `status:"read"` sobre o
 * `wamid` inbound (por isso também marca a mensagem como lida ✓✓ — comportamento
 * aceito nesta story). O indicador some sozinho em ~25s ou ao enviar a resposta.
 *
 * FIRE-AND-FORGET: nunca lança e nunca atrasa a resposta da Nicole. Qualquer
 * falha externa (4xx/5xx/timeout) é engolida — humanização é aditiva, não pode
 * quebrar o fluxo de atendimento.
 *
 * Mesmo padrão de credenciais/endpoint de `send-whatsapp-message.ts`.
 */

import type { WhatsAppConfig } from "./send-whatsapp-message"

/**
 * Dispara "digitando…" (e marca como lida) para o lead.
 *
 * @param waConfig      Credenciais resolvidas de `whatsapp_config` por `org_id`.
 * @param inboundWamid  `wamid` da mensagem recebida do lead (obrigatório pela Meta).
 * @param fetchImpl     Implementação de fetch (injetável para testes).
 */
export async function sendWhatsAppTypingIndicator(
  waConfig: WhatsAppConfig | null | undefined,
  inboundWamid: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!waConfig?.phone_number_id || !waConfig?.access_token || !inboundWamid) {
    return
  }

  try {
    await fetchImpl(
      `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: inboundWamid,
          typing_indicator: { type: "text" },
        }),
        signal: AbortSignal.timeout(10000),
      }
    )
  } catch {
    // fire-and-forget: nunca propaga
  }
}
