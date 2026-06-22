/**
 * Story 51-8 (Epic 51) — Helper de envio de TEMPLATE HSM via WhatsApp Cloud API.
 *
 * Função PURA de envio: recebe o telefone, a definição do template (name,
 * language, components) e as credenciais já resolvidas (de `whatsapp_config`
 * por `org_id`) e dispara um POST ao Graph API v21.0.
 *
 * Diferente de `sendWhatsAppMessage` (freeform `type:"text"`, só entregue dentro
 * da janela de 24h), este helper envia `type:"template"`. Templates HSM aprovados
 * pela Meta são entregues fora da janela de 24h, sem depender de conversa prévia —
 * exatamente o que os fluxos proativos (roleta, gestor, obra) precisam.
 *
 * Intencionalmente SEM imports `@web/*` ou Supabase: o alias `@web/*` não resolve
 * no vitest (issue pré-existente, ver Stories 50-3 / 51-1 / 51-5). A resolução de
 * `org_id` → `whatsapp_config` acontece no caller, que injeta as credenciais aqui.
 *
 * Espelha exatamente `send-whatsapp-message.ts` (blueprint): nunca lança,
 * `AbortSignal.timeout(15000)`, `fetchImpl` injetável para testes, `errorCode`
 * interno. Os tipos `WhatsAppConfig` e `SendWhatsAppResult` são reusados de lá.
 */

import type { WhatsAppConfig, SendWhatsAppResult } from "./send-whatsapp-message"

/** Componente `body` de um template: parâmetros de texto posicionais ({{1}}, {{2}}, ...). */
export interface WhatsAppTemplateBodyComponent {
  type: "body"
  parameters: Array<{ type: "text"; text: string }>
}

/** Componente `button` de URL dinâmica: o `text` é o sufixo da URL base embutida no template. */
export interface WhatsAppTemplateButtonComponent {
  type: "button"
  sub_type: "url"
  index: string // "0", "1", etc.
  parameters: Array<{ type: "text"; text: string }>
}

export type WhatsAppTemplateComponent =
  | WhatsAppTemplateBodyComponent
  | WhatsAppTemplateButtonComponent

export interface SendWhatsAppTemplateOptions {
  /** Nome do template aprovado na Meta (case-sensitive). Ex.: "novo_lead_corretor". */
  name: string
  /** Código de idioma do template. Ex.: "pt_BR". */
  languageCode: string
  /** Componentes do template (body + button). */
  components: WhatsAppTemplateComponent[]
}

/**
 * Envia um template HSM ao destinatário via WhatsApp Cloud API.
 *
 * Nunca lança: qualquer falha externa (4xx/5xx/timeout/rede) retorna
 * `{ sent: false, error }` para que o caller decida o que logar.
 *
 * @param waConfig Credenciais resolvidas de `whatsapp_config` por `org_id`.
 * @param phone    Telefone do destinatário em E.164 sem `+` (ex.: "5544999990000").
 * @param template Definição do template (name, languageCode, components).
 * @param fetchImpl Implementação de fetch (injetável para testes).
 */
export async function sendWhatsAppTemplate(
  waConfig: WhatsAppConfig | null | undefined,
  phone: string,
  template: SendWhatsAppTemplateOptions,
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
          type: "template",
          template: {
            name: template.name,
            language: { code: template.languageCode },
            components: template.components,
          },
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
