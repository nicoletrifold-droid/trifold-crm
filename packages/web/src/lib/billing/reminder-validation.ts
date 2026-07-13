// Story 78-8 — Validação de payload das rotas de CRUD de service_billing_reminders.
// Espelha EXATAMENTE os CHECK constraints fixados na migration 164 (Story 78-1):
//   currency      IN ('USD','BRL')
//   billing_cycle IN ('monthly','annual','usage')
//   status        IN ('pending','alerted','paid','postponed','skipped')
//   alert_days_before >= 0  (DEFAULT 7)
// Módulo compartilhado por POST (route.ts) e PATCH ([id]/route.ts) — validação única,
// sem duplicar a lista de enums nas duas rotas (defesa em profundidade sobre a RLS admin-only).

export const CURRENCIES = ["USD", "BRL"] as const
export const BILLING_CYCLES = ["monthly", "annual", "usage"] as const
export const REMINDER_STATUSES = ["pending", "alerted", "paid", "postponed", "skipped"] as const

export type Currency = (typeof CURRENCIES)[number]
export type BillingCycle = (typeof BILLING_CYCLES)[number]
export type ReminderStatus = (typeof REMINDER_STATUSES)[number]

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  if (y === undefined || m === undefined || d === undefined) return false
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  // Rejeita datas de calendário impossíveis (ex.: 2026-02-31).
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function isInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n)
}

export interface ReminderInsert {
  service_id: string
  due_date: string
  billing_cycle: BillingCycle
  currency: Currency
  alert_days_before: number
  status: ReminderStatus
  expected_amount: number | null
  notes: string | null
}

/** Valida o corpo de um POST (criação). Campos obrigatórios: service_id, due_date, billing_cycle. */
export function validateCreate(body: unknown): ValidationResult<ReminderInsert> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corpo da requisição inválido" }
  }
  const b = body as Record<string, unknown>

  if (typeof b.service_id !== "string" || b.service_id.trim() === "") {
    return { ok: false, error: "service_id é obrigatório" }
  }
  if (!isValidDate(b.due_date)) {
    return { ok: false, error: "due_date é obrigatório no formato YYYY-MM-DD" }
  }
  if (typeof b.billing_cycle !== "string" || !BILLING_CYCLES.includes(b.billing_cycle as BillingCycle)) {
    return { ok: false, error: `billing_cycle deve ser um de: ${BILLING_CYCLES.join(", ")}` }
  }

  // currency: default 'USD'
  const currency = b.currency === undefined ? "USD" : b.currency
  if (typeof currency !== "string" || !CURRENCIES.includes(currency as Currency)) {
    return { ok: false, error: `currency deve ser um de: ${CURRENCIES.join(", ")}` }
  }

  // status: default 'pending'
  const status = b.status === undefined ? "pending" : b.status
  if (typeof status !== "string" || !REMINDER_STATUSES.includes(status as ReminderStatus)) {
    return { ok: false, error: `status deve ser um de: ${REMINDER_STATUSES.join(", ")}` }
  }

  // alert_days_before: default 7 (espelha DEFAULT 7 da coluna)
  const alertDaysBefore = b.alert_days_before === undefined ? 7 : b.alert_days_before
  if (!isInteger(alertDaysBefore) || alertDaysBefore < 0) {
    return { ok: false, error: "alert_days_before deve ser um inteiro >= 0" }
  }

  let expectedAmount: number | null = null
  if (b.expected_amount !== undefined && b.expected_amount !== null) {
    if (typeof b.expected_amount !== "number" || Number.isNaN(b.expected_amount)) {
      return { ok: false, error: "expected_amount deve ser um número" }
    }
    expectedAmount = b.expected_amount
  }

  let notes: string | null = null
  if (b.notes !== undefined && b.notes !== null) {
    if (typeof b.notes !== "string") {
      return { ok: false, error: "notes deve ser texto" }
    }
    notes = b.notes
  }

  return {
    ok: true,
    value: {
      service_id: b.service_id,
      due_date: b.due_date as string,
      billing_cycle: b.billing_cycle as BillingCycle,
      currency: currency as Currency,
      alert_days_before: alertDaysBefore,
      status: status as ReminderStatus,
      expected_amount: expectedAmount,
      notes,
    },
  }
}

export type ReminderUpdate = Partial<{
  service_id: string
  due_date: string
  billing_cycle: BillingCycle
  currency: Currency
  alert_days_before: number
  status: ReminderStatus
  expected_amount: number | null
  notes: string | null
}>

/**
 * Valida o corpo de um PATCH (edição parcial). Só valida campos presentes; exige >= 1 campo.
 *
 * [Story 78-11, AC11] Campos derivados pelo servidor NUNCA são aceitos crus do cliente:
 *   - `paid_at`        → derivado da transição de status na rota [id]/route.ts;
 *   - `last_alerted_on` → gravado só pelo cron (dedup por dia) e pelo reset da recorrência-ao-pagar.
 * Este whitelist copia APENAS os campos conhecidos abaixo para `out`; qualquer outro campo do
 * corpo (incl. `paid_at`/`last_alerted_on`) é silenciosamente DESCARTADO — nunca chega ao UPDATE.
 * A escolha (ignorar em vez de rejeitar) espelha a disciplina já usada para `paid_at` na 78-8.
 */
export function validateUpdate(body: unknown): ValidationResult<ReminderUpdate> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corpo da requisição inválido" }
  }
  const b = body as Record<string, unknown>
  const out: ReminderUpdate = {}

  if (b.service_id !== undefined) {
    if (typeof b.service_id !== "string" || b.service_id.trim() === "") {
      return { ok: false, error: "service_id inválido" }
    }
    out.service_id = b.service_id
  }
  if (b.due_date !== undefined) {
    if (!isValidDate(b.due_date)) {
      return { ok: false, error: "due_date deve estar no formato YYYY-MM-DD" }
    }
    out.due_date = b.due_date
  }
  if (b.billing_cycle !== undefined) {
    if (typeof b.billing_cycle !== "string" || !BILLING_CYCLES.includes(b.billing_cycle as BillingCycle)) {
      return { ok: false, error: `billing_cycle deve ser um de: ${BILLING_CYCLES.join(", ")}` }
    }
    out.billing_cycle = b.billing_cycle as BillingCycle
  }
  if (b.currency !== undefined) {
    if (typeof b.currency !== "string" || !CURRENCIES.includes(b.currency as Currency)) {
      return { ok: false, error: `currency deve ser um de: ${CURRENCIES.join(", ")}` }
    }
    out.currency = b.currency as Currency
  }
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !REMINDER_STATUSES.includes(b.status as ReminderStatus)) {
      return { ok: false, error: `status deve ser um de: ${REMINDER_STATUSES.join(", ")}` }
    }
    out.status = b.status as ReminderStatus
  }
  if (b.alert_days_before !== undefined) {
    if (!isInteger(b.alert_days_before) || b.alert_days_before < 0) {
      return { ok: false, error: "alert_days_before deve ser um inteiro >= 0" }
    }
    out.alert_days_before = b.alert_days_before
  }
  if (b.expected_amount !== undefined) {
    if (b.expected_amount === null) {
      out.expected_amount = null
    } else if (typeof b.expected_amount !== "number" || Number.isNaN(b.expected_amount)) {
      return { ok: false, error: "expected_amount deve ser um número" }
    } else {
      out.expected_amount = b.expected_amount
    }
  }
  if (b.notes !== undefined) {
    if (b.notes === null) {
      out.notes = null
    } else if (typeof b.notes !== "string") {
      return { ok: false, error: "notes deve ser texto" }
    } else {
      out.notes = b.notes
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "Nenhum campo válido para atualizar" }
  }

  return { ok: true, value: out }
}
