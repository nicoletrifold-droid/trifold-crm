import type { SupabaseClient } from "@supabase/supabase-js"
import { isWithinWhatsAppWindow } from "@web/lib/broker/dispatch-broker-message"
import { sendWhatsAppMessage } from "@web/lib/whatsapp/send-whatsapp-message"
import { sendWhatsAppTemplate } from "@web/lib/whatsapp/send-template"
import { logWhatsappSend, type WaCategory } from "@web/lib/whatsapp/log-send"

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

/**
 * Story 75-350 — o ENVIO de follow-up, um só, para os DOIS caminhos.
 *
 * Esta função vivia dentro de `api/cron/followup/route.ts` e por isso a outra
 * porta do follow-up pós-visita (`visit-feedback-core`, acionada quando o corretor
 * preenche o feedback da visita) não tinha como reusá-la. O que ela fazia em vez
 * disso: gravava `follow_up_log` com `status: "sent"`, `sent_at` preenchido e uma
 * linha em `messages` — **sem mandar nada para o WhatsApp**. O CRM dizia "Nicole
 * enviou" e o lead nunca recebeu.
 *
 * Sair daqui não muda uma linha do comportamento do cron: é o mesmo código, no
 * lugar onde os dois caminhos alcançam.
 */
/**
 * Result of a follow-up send attempt.
 * - `sent`   → whether the message reached the channel
 * - `channel`→ "telegram" | "whatsapp" (for logging / activity copy)
 * - `reason` → stable skip/error code when `sent=false`
 *              (WHATSAPP_WINDOW_CLOSED | WHATSAPP_CONFIG_MISSING | TELEGRAM_TOKEN_MISSING | API_ERROR | UNSUPPORTED_CHANNEL)
 */
export interface FollowUpSendResult {
  sent: boolean
  channel: "telegram" | "whatsapp"
  reason?: string
  /** Original transport error string when reason === "API_ERROR". */
  error?: string
  /**
   * Story 75-353 — COMO a mensagem saiu. `template` significa que o lead recebeu
   * fora da janela de 24h, por HSM aprovado; `freeform` é o texto livre de
   * sempre. O chamador precisa disso para gravar na conversa o que o lead de fato
   * leu (o corpo do template, não o texto livre que nunca saiu).
   */
  via?: "freeform" | "template"
  /** Nome do template quando `via === "template"`. */
  template?: string
}

/**
 * Story 75-353 — o que enviar quando a janela de 24h está FECHADA.
 *
 * Sem isto, fora da janela nada sai: 20 dias de produção com 0 entregas e ~4.700
 * tentativas puladas por `WHATSAPP_WINDOW_CLOSED`. A decisão de mandar (e de qual
 * template, respeitando opt-out e cap de frequência) mora em
 * `lib/followup/template-fallback.ts` — aqui é só o transporte.
 */
export interface FollowUpTemplateFallback {
  name: string
  /** Parâmetros posicionais do corpo, já resolvidos. */
  params: string[]
  /** Categoria para o log de custo (`abertura_*` é marketing). */
  category: WaCategory
  /** Para o log: quem recebeu. */
  recipientType?: string
}

/**
 * Send a follow-up message to the lead via the correct channel.
 *
 * Channel detection (AC1):
 *  - phone starts with "tg:" → Telegram (Bot API) — behaviour PRESERVED (AC2)
 *  - otherwise               → WhatsApp Cloud API (AC3)
 *
 * WhatsApp 24h freeform window (AC3/AC4): freeform text can only be sent within
 * 24h of the lead's last message. The window is checked via
 * `conversations.last_message_at` (AC6) using `isWithinWhatsAppWindow` (reused
 * from Story 51-1). Outside the window, NO message is attempted and the result
 * is `{ sent: false, reason: 'WHATSAPP_WINDOW_CLOSED' }` so the caller can mark
 * the `follow_up_log` as `status='skipped'`. Approved templates (HSM) for the
 * out-of-window case are explicit backlog (see story "Backlog para Templates").
 *
 * Credentials come from the `whatsapp_config` table (org_id + status='active'),
 * NOT env vars (AC7) — same pattern as appointment-whatsapp-reminders / notify-broker.
 *
 * Never throws: any transport failure returns `{ sent: false, reason: 'API_ERROR' }`
 * so the cron loop is best-effort and a single lead cannot break the run (AC5).
 */
export async function sendFollowUpMessage(
  supabase: SupabaseClient,
  orgId: string,
  phone: string,
  message: string,
  conversationLastMessageAt: Date | string | null,
  now: Date = new Date(),
  /** Story 75-353 — presente: fora da janela manda ESTE template em vez de pular. */
  fallbackTemplate?: FollowUpTemplateFallback | null
): Promise<FollowUpSendResult> {
  // --- Telegram branch (AC2): preserved verbatim ---
  if (phone.startsWith("tg:")) {
    if (!TELEGRAM_BOT_TOKEN) {
      console.error("[FOLLOWUP] TELEGRAM_BOT_TOKEN not configured — message not sent")
      return { sent: false, channel: "telegram", reason: "TELEGRAM_TOKEN_MISSING" }
    }

    const chatId = phone.replace("tg:", "")

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message }),
          signal: AbortSignal.timeout(30000),
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[FOLLOWUP] Telegram API error ${res.status}: ${errText}`)
        return { sent: false, channel: "telegram", reason: "API_ERROR", error: `HTTP_${res.status}` }
      }

      return { sent: true, channel: "telegram", via: "freeform" }
    } catch (err) {
      console.error("[FOLLOWUP] Telegram send failed:", err)
      return { sent: false, channel: "telegram", reason: "API_ERROR", error: String(err) }
    }
  }

  // --- WhatsApp branch (AC3/AC4) ---
  const dentroDaJanela = isWithinWhatsAppWindow(conversationLastMessageAt, now)

  // Story 75-353 — fora da janela SEM template continua sendo o que era: não se
  // tenta nada. Com template, o envio sai por HSM aprovado, que entrega fora da
  // janela. Esta é a linha que separa "0 entregas em 20 dias" de "entrega".
  if (!dentroDaJanela && !fallbackTemplate) {
    return { sent: false, channel: "whatsapp", reason: "WHATSAPP_WINDOW_CLOSED" }
  }

  // Resolve credentials from whatsapp_config by org (AC7) — NOT env vars.
  const { data: waConfig } = await supabase
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    return { sent: false, channel: "whatsapp", reason: "WHATSAPP_CONFIG_MISSING" }
  }

  if (!dentroDaJanela && fallbackTemplate) {
    try {
      await sendWhatsAppTemplate(
        waConfig.phone_number_id,
        waConfig.access_token,
        phone,
        fallbackTemplate.name,
        [
          {
            type: "body",
            parameters: fallbackTemplate.params.map((text) => ({ type: "text", text })),
          },
        ]
      )
    } catch (err) {
      const erro = err instanceof Error ? err.message : String(err)
      // Template CUSTA na Meta: falha também vai para o log de envio, senão o
      // custo e a taxa de erro do follow-up ficam invisíveis (foi o que aconteceu
      // com os lembretes de visita, que nunca registraram nada).
      void logWhatsappSend(supabase, {
        orgId,
        template: fallbackTemplate.name,
        category: fallbackTemplate.category,
        recipientType: fallbackTemplate.recipientType ?? "lead",
        toPhone: phone,
        status: "failed",
        error: erro.slice(0, 300),
      })
      return { sent: false, channel: "whatsapp", reason: "API_ERROR", error: erro, via: "template", template: fallbackTemplate.name }
    }

    void logWhatsappSend(supabase, {
      orgId,
      template: fallbackTemplate.name,
      category: fallbackTemplate.category,
      recipientType: fallbackTemplate.recipientType ?? "lead",
      toPhone: phone,
      status: "sent",
    })

    return { sent: true, channel: "whatsapp", via: "template", template: fallbackTemplate.name }
  }

  const result = await sendWhatsAppMessage(waConfig, phone, message)

  if (!result.sent) {
    return { sent: false, channel: "whatsapp", reason: "API_ERROR", error: result.error }
  }

  return { sent: true, channel: "whatsapp", via: "freeform" }
}

