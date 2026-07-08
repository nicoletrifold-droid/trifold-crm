import {
  type ReminderRow,
  daysUntil,
  firstService,
  formatMoney,
} from "./shared"

const CYCLE_LABELS: Record<string, string> = {
  monthly: "mensal",
  annual: "anual",
  usage: "uso",
}

function dueLabel(days: number): string {
  if (days < 0) return `vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`
  if (days === 0) return "vence hoje"
  if (days === 1) return "vence amanhã"
  return `vence em ${days} dias`
}

/**
 * Seção "Próximos vencimentos" (Story 78-9 — AC4). Consome dados já buscados de
 * GET /api/admin/billing-reminders (Story 78-8). Ordena defensivamente por due_date,
 * destaca vencimentos dentro da janela alert_days_before, e trata estado vazio/404/erro.
 */
export function UpcomingReminders({
  reminders,
  errored,
}: {
  reminders: ReminderRow[] | null
  errored: boolean
}) {
  if (errored) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
        Não foi possível carregar os vencimentos. Tente novamente em instantes.
      </div>
    )
  }

  const list = (reminders ?? [])
    .filter((r) => r.status === "pending" || r.status === "alerted")
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
        Nenhum vencimento cadastrado ainda.
      </div>
    )
  }

  return (
    <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
      {list.map((r) => {
        const svc = firstService(r.platform_services)
        const days = daysUntil(r.due_date)
        const isDue = days <= r.alert_days_before
        const isOverdue = days < 0
        const highlight = isOverdue
          ? "border-l-red-500"
          : isDue
            ? "border-l-amber-500"
            : "border-l-transparent"
        const dueColor = isOverdue
          ? "text-red-600 dark:text-red-400"
          : isDue
            ? "text-amber-600 dark:text-amber-400"
            : "text-stone-500 dark:text-stone-400"

        const amount =
          r.expected_amount != null ? formatMoney(Number(r.expected_amount), r.currency) : "—"

        return (
          <div
            key={r.id}
            className={`flex items-center justify-between gap-3 border-l-2 px-4 py-3 ${highlight}`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                {svc?.name ?? "Serviço"}
              </p>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">
                {r.due_date} · ciclo {CYCLE_LABELS[r.billing_cycle] ?? r.billing_cycle}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{amount}</p>
              <p className={`text-[11px] font-medium ${dueColor}`}>{dueLabel(days)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
