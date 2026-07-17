/**
 * Story 75-171 — Assinatura automática do remetente humano na mensagem ao lead.
 *
 * Do lado do lead toda mensagem chega pelo número da EMPRESA (a Meta não
 * transmite quem é o operador), então o texto enviado por um humano vai
 * prefixado com o primeiro nome de quem escreveu. Aplica-se APENAS à mensagem
 * principal digitada no chat (`role='broker'` em send-message/route.ts) —
 * transição, Nicole, áudio/arquivos e template de abertura ficam fora.
 *
 * Função PURA sem imports `@web/*` (mesmo padrão de dispatch-broker-message.ts)
 * para resolver no vitest.
 */

import type { DispatchChannel } from "./dispatch-broker-message"

/**
 * Primeiro nome do remetente: primeiro token de `name` após trim.
 * Ex.: "Valeria Souza" → "Valeria". Nome vazio/só espaços → "".
 */
export function senderFirstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? ""
}

/**
 * Prefixa a mensagem com a assinatura do remetente, por canal:
 *  - WhatsApp: `*Nome:*\n{mensagem}` — asteriscos viram negrito nativo.
 *  - Telegram: `Nome:\n{mensagem}` — o sendMessage vai sem `parse_mode`,
 *    asterisco apareceria cru para o lead.
 *
 * Sem nome resolvível, devolve a mensagem inalterada (AC5).
 */
export function buildSignedMessage(
  senderName: string | null | undefined,
  message: string,
  channel: DispatchChannel
): string {
  const firstName = senderFirstName(senderName)
  if (!firstName) return message
  const prefix =
    channel === "whatsapp" ? `*${firstName}:*` : `${firstName}:`
  return `${prefix}\n${message}`
}
