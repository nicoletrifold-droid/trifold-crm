// Story 75-141 — classificação e mensagens amigáveis de erro de envio (WhatsApp).
// A Meta não valida "é WhatsApp?" antes; descobrimos no envio. Alguns códigos de
// erro indicam número não alcançável / provavelmente sem WhatsApp.

// Códigos da Cloud API que tratamos como "não foi possível entregar a este número"
// (provável número sem WhatsApp / inválido). 131026 = Message undeliverable;
// 131021 = recipient cannot be sender.
const UNREACHABLE_META_CODES = new Set([131026, 131021])

/** Mapeia (status HTTP, código Meta) → código de erro interno. */
export function classifyWhatsAppSendError(httpStatus: number, metaCode?: number | null): string {
  if (metaCode != null && UNREACHABLE_META_CODES.has(metaCode)) return "WHATSAPP_UNREACHABLE"
  return `HTTP_${httpStatus}`
}

/** Mensagem amigável (PT) para exibir ao corretor a partir do código de erro. */
export function brokerSendErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "WHATSAPP_UNREACHABLE":
      return "Não foi possível entregar. Este número pode não ter WhatsApp."
    case "WHATSAPP_WINDOW_CLOSED":
      return "A janela de 24h está fechada. O cliente precisa te enviar uma mensagem para reabrir a conversa."
    case "WHATSAPP_CONFIG_MISSING":
      return "O WhatsApp da empresa não está configurado. Fale com o administrador."
    case "TIMEOUT":
      return "Tempo esgotado ao enviar. Verifique a conexão e tente novamente."
    default:
      return "Não foi possível enviar a mensagem. Tente novamente."
  }
}
