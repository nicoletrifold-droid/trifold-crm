// Story 75-135 — validação client-side do formulário "Enviar para assinatura",
// antes de chamar a Clicksign (que devolve erros técnicos crus). Função pura/testável.

export interface SignerFormInput {
  name: string
  email: string
  phone: string
  auth: string // "email" | "whatsapp" | "sms"
}

// Estrito o bastante para pegar typos comuns (ex.: vírgula no lugar do ponto:
// "trifold.eng,br"): local/domínio com charset válido + TLD só letras.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** Retorna a mensagem de erro (PT) ou null se o formulário está válido. */
export function validateSignerForm({ name, email, phone, auth }: SignerFormInput): string | null {
  // Nome: a Clicksign exige nome completo (≥ 2 palavras).
  if (name.trim().split(/\s+/).filter(Boolean).length < 2) {
    return "Informe o nome completo (nome e sobrenome)."
  }

  const e = email.trim()
  const p = phone.trim()

  if (e && !EMAIL_RE.test(e)) return "E-mail inválido."

  if (auth === "email" && !e) {
    return "Informe o e-mail (autenticação por e-mail)."
  }

  if ((auth === "whatsapp" || auth === "sms") && p.replace(/\D/g, "").length < 10) {
    return "Informe um telefone válido com DDD."
  }

  if (!e && !p) return "Informe e-mail ou telefone do signatário."

  return null
}
