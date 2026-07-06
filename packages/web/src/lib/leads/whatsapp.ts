// Story 75-139 — detecção de WhatsApp do lead. Fonte única/testável para decidir
// se mostramos o ícone de WhatsApp e quão confiantes estamos de que o número tem
// WhatsApp. A Meta não oferece validação prévia confiável (endpoint de contacts
// descontinuado), então: celular válido = "provável"; comprovado = origem WhatsApp
// ou já tem conversa; a confirmação real só vem no envio (Story 75-141).

export type WhatsAppState = "confirmed" | "likely" | "none"

// Origens que comprovam WhatsApp (case-insensitive, por prefixo/contains).
const WA_SOURCE_HINTS = ["whatsapp", "ctwa", "click_to_ad", "click-to-ad"]

/** Celular brasileiro válido? Aceita com/sem DDI 55 e com máscara. Telegram = false. */
export function isLikelyMobileBR(phone: string | null | undefined): boolean {
  if (!phone) return false
  if (phone.trim().toLowerCase().startsWith("tg:")) return false // Telegram
  let digits = phone.replace(/\D/g, "")
  if (!digits) return false
  // Remove DDI 55 quando presente (55 + 2 DDD + 9 dígitos = 13).
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2)
  if (digits.length === 12 && digits.startsWith("55")) digits = digits.slice(2) // caso raro sem 9º
  // Celular = DDD (2) + 9 dígitos, começando o assinante com 9.
  if (digits.length !== 11) return false
  const ddd = digits.slice(0, 2)
  if (ddd[0] === "0") return false
  return digits[2] === "9"
}

/** Origem/conversa comprovam que o lead usa WhatsApp? */
export function isWhatsAppConfirmed(input: {
  source?: string | null
  hasWhatsappConversation?: boolean
}): boolean {
  if (input.hasWhatsappConversation) return true
  const s = (input.source ?? "").toLowerCase()
  return s ? WA_SOURCE_HINTS.some((h) => s.includes(h)) : false
}

/** Estado consolidado para a UI decidir o ícone/tooltip. */
export function whatsAppState(input: {
  phone: string | null | undefined
  source?: string | null
  hasWhatsappConversation?: boolean
}): WhatsAppState {
  // Comprovado vence: um lead com conversa de WhatsApp é WhatsApp mesmo que o
  // formato do telefone seja atípico. Só o prefixo tg: (Telegram) exclui.
  const isTelegram = (input.phone ?? "").trim().toLowerCase().startsWith("tg:")
  if (!isTelegram && isWhatsAppConfirmed(input)) return "confirmed"
  if (isLikelyMobileBR(input.phone)) return "likely"
  return "none"
}
