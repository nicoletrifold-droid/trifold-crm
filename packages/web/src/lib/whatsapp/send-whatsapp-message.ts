/**
 * Story 51-5 (Epic 51) — Helper de envio de mensagem freeform via WhatsApp Cloud API.
 *
 * Função PURA de envio: recebe o telefone, a mensagem e as credenciais já
 * resolvidas (de `whatsapp_config` por `org_id`) e dispara um POST ao Graph API.
 *
 * Intencionalmente SEM imports `@web/*` ou Supabase: o alias `@web/*` não resolve
 * no vitest (issue pré-existente, ver Stories 50-3 / 51-1). A resolução de
 * `org_id` → `whatsapp_config` acontece no caller (o cron de follow-up), que
 * injeta as credenciais aqui.
 *
 * IMPORTANTE — Janela de 24h: este helper NÃO verifica a janela freeform de 24h.
 * Por contrato (AC3/AC4 da story), o caller decide se pode enviar texto livre
 * usando `isWithinWhatsAppWindow` (reusado de `lib/broker/dispatch-broker-message`)
 * ANTES de chamar este helper. Fora da janela, o caller pula o envio e loga o skip.
 *
 * Padrões reusados:
 *  - WhatsApp Cloud API (Graph v21.0): `api/cron/appointment-whatsapp-reminders/route.ts`
 *    (sendWhatsApp) e `lib/roleta/notify-broker.ts` (sendBrokerWhatsApp).
 */

export interface WhatsAppConfig {
  /** `whatsapp_config.phone_number_id` da org (status='active'). */
  phone_number_id: string
  /** `whatsapp_config.access_token` da org (status='active'). */
  access_token: string
}

export interface SendWhatsAppResult {
  sent: boolean
  /** Código estável do erro quando `sent=false` (ex.: HTTP_500, TIMEOUT). */
  error?: string
}

/**
 * Envia uma mensagem de texto (freeform) ao lead via WhatsApp Cloud API.
 *
 * Nunca lança: qualquer falha externa (4xx/5xx/timeout) retorna
 * `{ sent: false, error }` para que o cron consiga gravar a mensagem em
 * `messages` / atualizar o `follow_up_log` mesmo com falha de envio (AC5).
 *
 * @param waConfig Credenciais resolvidas de `whatsapp_config` por `org_id`.
 * @param phone    Telefone do lead em E.164 sem `+` (ex.: "5544999990000").
 * @param message  Texto a enviar.
 * @param fetchImpl Implementação de fetch (injetável para testes).
 */
export async function sendWhatsAppMessage(
  waConfig: WhatsAppConfig | null | undefined,
  phone: string,
  message: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendWhatsAppResult> {
  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    return { sent: false, error: "WHATSAPP_CONFIG_MISSING" }
  }

  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        }),
        signal: AbortSignal.timeout(15000),
      }
    )

    if (!res.ok) {
      return { sent: false, error: `HTTP_${res.status}` }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: errorCode(err) }
  }
}

function errorCode(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "TIMEOUT"
    return err.message || "SEND_FAILED"
  }
  return "SEND_FAILED"
}
