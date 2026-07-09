import { normalizePhoneBR } from "@trifold/shared"

// Story 80-1 — validação/normalização de contato (e-mail, telefone BR, CPF/CNPJ).
// Compartilhado por client e server (isomórfico). Objetivo: travar preenchimento errado
// nos formulários do módulo Pastas (e reutilizável em outros).

// ===== E-mail =====
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function isValidEmail(v: string | null | undefined): boolean {
  return EMAIL_RE.test((v ?? "").trim())
}

/** Normaliza para armazenar: trim + minúsculas. */
export function normalizeEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase()
}

export function emailError(v: string | null | undefined, required = false): string | null {
  const t = (v ?? "").trim()
  if (!t) return required ? "E-mail é obrigatório." : null
  return isValidEmail(t) ? null : "E-mail inválido."
}

// ===== Telefone (BR) =====
/** Máscara progressiva: (44) 99999-9999 (celular) ou (44) 3333-3333 (fixo). */
export function maskPhoneBR(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "").slice(0, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Válido = 10 (fixo) ou 11 (celular) dígitos com DDD (normalizePhoneBR não retorna null). */
export function isValidPhoneBR(v: string | null | undefined): boolean {
  const d = (v ?? "").replace(/\D/g, "")
  if (d.length < 10 || d.length > 11) return false
  return normalizePhoneBR(v ?? "") !== null
}

/** Formato padronizado p/ armazenar: sempre com máscara (44) 99999-9999. */
export function formatPhoneBR(v: string | null | undefined): string {
  return maskPhoneBR(v)
}

export function phoneError(v: string | null | undefined, required = false): string | null {
  const t = (v ?? "").trim()
  if (!t) return required ? "Telefone é obrigatório." : null
  return isValidPhoneBR(t) ? null : "Telefone inválido — use DDD + número (10 ou 11 dígitos)."
}

// ===== CPF / CNPJ (com dígito verificador) =====
export function maskCpf(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "").slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function maskCnpj(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "").slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

/** Aplica máscara de CPF (≤11 díg.) ou CNPJ (>11 díg.) conforme o comprimento. */
export function maskCpfCnpj(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "")
  return d.length > 11 ? maskCnpj(d) : maskCpf(d)
}

export function isValidCpf(v: string | null | undefined): boolean {
  const c = (v ?? "").replace(/\D/g, "")
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const calc = (base: string, factorStart: number): number => {
    let sum = 0
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factorStart - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = calc(c.slice(0, 9), 10)
  const d2 = calc(c.slice(0, 10), 11)
  return d1 === Number(c[9]) && d2 === Number(c[10])
}

export function isValidCnpj(v: string | null | undefined): boolean {
  const c = (v ?? "").replace(/\D/g, "")
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const calc = (len: number): number => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(c[i]) * weights[i]!
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13])
}

/** Valida CPF (11 díg.) ou CNPJ (14 díg.) conforme o comprimento. */
export function isValidCpfCnpj(v: string | null | undefined): boolean {
  const d = (v ?? "").replace(/\D/g, "")
  if (d.length === 11) return isValidCpf(d)
  if (d.length === 14) return isValidCnpj(d)
  return false
}

export function cpfCnpjError(v: string | null | undefined, required = false): string | null {
  const t = (v ?? "").trim()
  if (!t) return required ? "CPF/CNPJ é obrigatório." : null
  return isValidCpfCnpj(t) ? null : "CPF/CNPJ inválido."
}
