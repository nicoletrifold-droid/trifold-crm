/**
 * Story 75-289 (AC2) — a bolha do corretor deixa de mentir "Enviado".
 *
 * Antes, TODA mensagem com `role === "broker"` recebia um ✓ com
 * `aria-label="Enviado"`. Quando o envio ao Graph falhava, o `send_error` era
 * gravado em `messages.metadata` e ninguém lia: a mensagem aparecia entregue na
 * tela e o lead nunca recebia. Foi assim que, em 10/08, duas mensagens de
 * corretor sumiram sem que ninguém percebesse — uma delas em negociação de valor.
 *
 * Helper PURO (mesma convenção do `bubble-styles.ts`): a decisão fica aqui e é
 * testável sem DOM; o JSX só escolhe o ícone.
 */

export type DeliveryState =
  /** Não é mensagem nossa (lead/Nicole/sistema) — não exibe indicador. */
  | "none"
  /** Saiu para o WhatsApp/Telegram. */
  | "sent"
  /** Gravada mas NÃO entregue — precisa de ação humana. */
  | "failed"
  /** Fora da janela de 24h: não é falha de infra, é regra da Meta. */
  | "window_closed"

export interface DeliveryStatus {
  state: DeliveryState
  /** Texto curto exibido ao lado do horário (vazio quando `none`). */
  label: string
  /** Explicação para tooltip/`title` — dá ao corretor o próximo passo. */
  hint: string
  /** Só `failed` oferece reenviar; janela fechada exige template de abertura. */
  canResend: boolean
}

const WINDOW_CLOSED = "WHATSAPP_WINDOW_CLOSED"

/**
 * Traduz o `metadata` da mensagem no indicador de entrega.
 *
 * @param msg mensagem do thread (role + metadata como já chegam à UI)
 */
export function resolveDeliveryStatus(msg: {
  role: string
  metadata?: Record<string, unknown> | null
}): DeliveryStatus {
  if (msg.role !== "broker") {
    return { state: "none", label: "", hint: "", canResend: false }
  }

  const sendError = msg.metadata?.send_error
  if (typeof sendError !== "string" || !sendError.trim()) {
    return { state: "sent", label: "", hint: "Enviado", canResend: false }
  }

  // Janela de 24h fechada é um caso à parte: reenviar o mesmo texto livre NÃO vai
  // funcionar (a Meta recusa). O caminho é a mensagem de abertura por template.
  if (sendError.includes(WINDOW_CLOSED)) {
    return {
      state: "window_closed",
      label: "Não entregue",
      hint: "A janela de 24h do WhatsApp fechou. Use uma mensagem de abertura aprovada para reabrir a conversa.",
      canResend: false,
    }
  }

  return {
    state: "failed",
    label: "Não entregue",
    hint: `Esta mensagem NÃO chegou ao lead (${sendError}). Toque em reenviar.`,
    canResend: true,
  }
}
