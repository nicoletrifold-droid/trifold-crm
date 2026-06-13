/**
 * Story 51-1 (Epic 51) — Dispatch de mensagem do corretor ao lead.
 *
 * Função PURA de despacho: recebe o canal já resolvido (phone + credenciais)
 * e envia a mensagem pelo canal correto (Telegram ou WhatsApp Cloud API).
 *
 * Intencionalmente SEM imports `@web/*` ou Supabase: o alias `@web/*` não
 * resolve no vitest (issue pré-existente, ver Story 50-3). A resolução de
 * `org_id` → `whatsapp_config` e a leitura de `conversations.last_message_at`
 * acontecem no route (`send-message/route.ts`), que injeta os dados aqui.
 *
 * Padrões reusados:
 *  - WhatsApp Cloud API: `lib/roleta/notify-broker.ts` (sendBrokerWhatsApp)
 *  - Telegram Bot API: `api/cron/followup/route.ts` (sendFollowUpMessage)
 *  - Prefixo `tg:` para chat_id Telegram: webhooks + cron followup
 */

/** Janela freeform do WhatsApp Business: 24h após a última mensagem do lead. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000

export type DispatchChannel = "telegram" | "whatsapp"

export interface WhatsAppCredentials {
  phoneNumberId: string
  accessToken: string
}

export interface DispatchBrokerMessageParams {
  /** `leads.phone` — prefixo `tg:` indica Telegram; demais → WhatsApp. */
  phone: string
  /** Texto a enviar (já validado pelo route: não vazio, <= 4096 chars). */
  message: string
  /** `conversations.last_message_at` — usado para a janela de 24h do WhatsApp. */
  conversationLastMessageAt: Date | string | null
  /** Credenciais WhatsApp resolvidas de `whatsapp_config` (por `org_id`). */
  waCredentials?: WhatsAppCredentials | null
  /** Token do bot Telegram (`process.env.TELEGRAM_BOT_TOKEN`). */
  telegramBotToken?: string | null
  /** Momento atual — injetável para testes determinísticos. */
  now?: Date
}

export interface DispatchResult {
  sent: boolean
  channel: DispatchChannel
  /** Código estável do erro quando `sent=false`. */
  error?: string
}

/** Determina o canal do lead a partir do `phone`. */
export function resolveChannel(phone: string): DispatchChannel {
  return phone.startsWith("tg:") ? "telegram" : "whatsapp"
}

/**
 * Verifica se o envio freeform do WhatsApp está dentro da janela de 24h.
 * Sem `last_message_at` registrado, trata como FORA da janela (conservador).
 */
export function isWithinWhatsAppWindow(
  lastMessageAt: Date | string | null,
  now: Date = new Date()
): boolean {
  if (!lastMessageAt) return false
  const last = lastMessageAt instanceof Date ? lastMessageAt : new Date(lastMessageAt)
  if (Number.isNaN(last.getTime())) return false
  return now.getTime() - last.getTime() <= WHATSAPP_WINDOW_MS
}

/**
 * Envia a mensagem do corretor ao lead pelo canal apropriado.
 *
 * Nunca lança: qualquer falha externa retorna `{ sent: false, error }` para
 * que o route consiga gravar a mensagem em `messages` mesmo com falha de envio
 * (AC7).
 */
export async function dispatchBrokerMessage(
  params: DispatchBrokerMessageParams,
  fetchImpl: typeof fetch = fetch
): Promise<DispatchResult> {
  const { phone, message, conversationLastMessageAt, now = new Date() } = params
  const channel = resolveChannel(phone)

  if (channel === "telegram") {
    return dispatchTelegram(phone, message, params.telegramBotToken, fetchImpl)
  }

  // WhatsApp: checar janela de 24h ANTES de tentar enviar (AC3)
  if (!isWithinWhatsAppWindow(conversationLastMessageAt, now)) {
    return { sent: false, channel, error: "WHATSAPP_WINDOW_CLOSED" }
  }

  return dispatchWhatsApp(phone, message, params.waCredentials, fetchImpl)
}

async function dispatchTelegram(
  phone: string,
  message: string,
  token: string | null | undefined,
  fetchImpl: typeof fetch
): Promise<DispatchResult> {
  const channel: DispatchChannel = "telegram"
  if (!token) {
    return { sent: false, channel, error: "TELEGRAM_TOKEN_MISSING" }
  }

  const chatId = phone.replace("tg:", "")

  try {
    const res = await fetchImpl(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message }),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!res.ok) {
      return { sent: false, channel, error: `HTTP_${res.status}` }
    }
    return { sent: true, channel }
  } catch (err) {
    return { sent: false, channel, error: errorCode(err) }
  }
}

async function dispatchWhatsApp(
  phone: string,
  message: string,
  credentials: WhatsAppCredentials | null | undefined,
  fetchImpl: typeof fetch
): Promise<DispatchResult> {
  const channel: DispatchChannel = "whatsapp"
  if (!credentials?.phoneNumberId || !credentials?.accessToken) {
    return { sent: false, channel, error: "WHATSAPP_CONFIG_MISSING" }
  }

  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/v21.0/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
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
      return { sent: false, channel, error: `HTTP_${res.status}` }
    }
    return { sent: true, channel }
  } catch (err) {
    return { sent: false, channel, error: errorCode(err) }
  }
}

function errorCode(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "TIMEOUT"
    return err.message || "SEND_FAILED"
  }
  return "SEND_FAILED"
}
