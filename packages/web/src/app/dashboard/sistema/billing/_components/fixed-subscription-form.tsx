"use client"

import { useState } from "react"
import { type ReminderRow } from "./shared"

// Story 78-15 (AC4/AC5) — formulário controlado de edição de UMA assinatura fixa.
// Sem shadcn/ui (padrão da 78-9): HTML nativo controlado por useState, Tailwind puro.
//
// Regras de editabilidade (AC4, tabela nas Dev Notes):
//   - expected_amount + currency, due_date, billing_cycle (monthly/annual), alert_days_before:
//     SEMPRE editáveis para qualquer assinatura.
//   - subscription_seats: editável só quando NÃO há enriquecedor (claude_team). Para vercel/supabase
//     é o dado que o enriquecedor da 78-14 preenche → somente-leitura (informativo).
//   - subscription_plan: editável (texto livre) SÓ para claude_team. Para vercel/supabase o
//     enriquecedor sobrescreve incondicionalmente (sem `plan_source` de proteção) → somente-leitura.
//
// Conversão numérica (armadilha conhecida, Dev Notes): expected_amount/subscription_seats/
// alert_days_before vão no PATCH como `number`, nunca `string` — validateUpdate (78-14) devolve 400
// se receber string crua de um <input>.

const INPUT_CLASS =
  "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 " +
  "focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 " +
  "dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"

const LABEL_CLASS =
  "mb-1 block text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400"

export function FixedSubscriptionForm({
  reminder,
  slug,
  onCancel,
  onSaved,
}: {
  reminder: ReminderRow
  slug: string | undefined
  onCancel: () => void
  onSaved: (row: ReminderRow) => void
}) {
  // vercel/supabase têm enriquecedor (78-14) → plano/assentos auto-gerenciados (read-only).
  const isEnriched = slug === "vercel" || slug === "supabase"
  // claude_team não tem enriquecedor → subscription_plan é texto livre editável.
  const planEditable = slug === "claude_team"

  const [amount, setAmount] = useState(
    reminder.expected_amount == null ? "" : String(reminder.expected_amount)
  )
  const [currency, setCurrency] = useState(reminder.currency === "BRL" ? "BRL" : "USD")
  const [dueDate, setDueDate] = useState(reminder.due_date ?? "")
  const [cycle, setCycle] = useState(reminder.billing_cycle === "annual" ? "annual" : "monthly")
  const [alertDays, setAlertDays] = useState(String(reminder.alert_days_before ?? 7))
  const [seats, setSeats] = useState(
    reminder.subscription_seats == null ? "" : String(reminder.subscription_seats)
  )
  const [plan, setPlan] = useState(reminder.subscription_plan ?? "")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idPrefix = `sub-${reminder.id}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const payload: Record<string, unknown> = {}

    // expected_amount: "" → null; senão número finito.
    const amtStr = amount.trim()
    const amtVal = amtStr === "" ? null : Number(amtStr)
    if (amtStr !== "" && !Number.isFinite(amtVal)) {
      setError("Valor mensal inválido.")
      return
    }
    const origAmt = reminder.expected_amount == null ? null : Number(reminder.expected_amount)
    if (amtVal !== origAmt) payload.expected_amount = amtVal

    // currency
    if (currency !== reminder.currency) payload.currency = currency

    // due_date: só envia se preenchida (o PATCH não aceita null p/ due_date) e mudou.
    if (dueDate && dueDate !== reminder.due_date) payload.due_date = dueDate

    // billing_cycle (compara com o valor cru — corrige um eventual 'usage' herdado).
    if (cycle !== reminder.billing_cycle) payload.billing_cycle = cycle

    // alert_days_before
    const adbStr = alertDays.trim()
    const adbVal = adbStr === "" ? 0 : Number(adbStr)
    if (!Number.isInteger(adbVal) || adbVal < 0) {
      setError("Dias de alerta deve ser um inteiro maior ou igual a 0.")
      return
    }
    if (adbVal !== reminder.alert_days_before) payload.alert_days_before = adbVal

    // subscription_seats: editável só quando não enriquecido.
    if (!isEnriched) {
      const seatsStr = seats.trim()
      const seatsVal = seatsStr === "" ? null : Number(seatsStr)
      if (seatsStr !== "" && (!Number.isInteger(seatsVal) || (seatsVal as number) < 0)) {
        setError("Assentos deve ser um inteiro maior ou igual a 0.")
        return
      }
      const origSeats = reminder.subscription_seats ?? null
      if (seatsVal !== origSeats) payload.subscription_seats = seatsVal
    }

    // subscription_plan: editável só para claude_team.
    if (planEditable) {
      const planStr = plan.trim()
      const planVal = planStr === "" ? null : planStr
      const origPlan = reminder.subscription_plan ?? null
      if (planVal !== origPlan) payload.subscription_plan = planVal
    }

    if (Object.keys(payload).length === 0) {
      onCancel()
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/billing-reminders/${reminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? "Não foi possível salvar. Tente novamente.")
        return
      }
      const j = (await res.json()) as { data: ReminderRow }
      onSaved(j.data)
    } catch {
      setError("Falha de rede ao salvar. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-stone-100 pt-3 dark:border-stone-800">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-amount`} className={LABEL_CLASS}>
            Valor mensal
          </label>
          <input
            id={`${idPrefix}-amount`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-currency`} className={LABEL_CLASS}>
            Moeda
          </label>
          <select
            id={`${idPrefix}-currency`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-due`} className={LABEL_CLASS}>
            Próxima renovação
          </label>
          <input
            id={`${idPrefix}-due`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-cycle`} className={LABEL_CLASS}>
            Ciclo
          </label>
          <select
            id={`${idPrefix}-cycle`}
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="monthly">Mensal</option>
            <option value="annual">Anual</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-alert`} className={LABEL_CLASS}>
            Alertar dias antes
          </label>
          <input
            id={`${idPrefix}-alert`}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={alertDays}
            onChange={(e) => setAlertDays(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-seats`} className={LABEL_CLASS}>
            Assentos
          </label>
          {isEnriched ? (
            <p
              id={`${idPrefix}-seats`}
              className="rounded border border-dashed border-stone-200 px-2 py-1.5 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400"
            >
              {reminder.subscription_seats ?? "—"}
              <span className="ml-1 text-[10px] uppercase tracking-wide text-stone-400">
                auto via API
              </span>
            </p>
          ) : (
            <input
              id={`${idPrefix}-seats`}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              placeholder="—"
              className={INPUT_CLASS}
            />
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-plan`} className={LABEL_CLASS}>
          Plano
        </label>
        {planEditable ? (
          <input
            id={`${idPrefix}-plan`}
            type="text"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="ex.: Team"
            className={INPUT_CLASS}
          />
        ) : (
          <p
            id={`${idPrefix}-plan`}
            className="rounded border border-dashed border-stone-200 px-2 py-1.5 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400"
          >
            {reminder.subscription_plan ?? "—"}
            <span className="ml-1 text-[10px] uppercase tracking-wide text-stone-400">
              auto via API
            </span>
          </p>
        )}
      </div>

      {error && (
        <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  )
}
