/**
 * Filtro "Data da Tarefa" (Story 75-37) — converte um preset rápido ou um intervalo
 * De/Até em um range `{ from, to }` (to exclusivo) usado para filtrar `lead_tasks.due_at`.
 *
 * `new Date()` é isolado aqui (fora do corpo do server component) para não violar a regra
 * de pureza do react-hooks — mesmo padrão de `stale-cutoff.ts`. O servidor roda em
 * America/Sao_Paulo (ver `instrumentation.ts`), então os limites são em horário de Brasília.
 */

export type TaskDateRangeResult = { from: Date; to: Date } | "any" | null

export const TASK_DATE_PRESETS: { key: string; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "amanha", label: "Amanhã" },
  { key: "esta-semana", label: "Esta Semana" },
  { key: "proxima-semana", label: "Próxima Semana" },
  { key: "este-mes", label: "Este Mês" },
  { key: "proximo-mes", label: "Próximo Mês" },
  { key: "todas", label: "Todo Período" },
]

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Converte "2026-06-30" em Date no início do dia em horário local (Brasília). */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

export function taskDateRange(
  preset: string | undefined,
  fromStr?: string,
  toStr?: string
): TaskDateRangeResult {
  if (!preset) return null
  const today = startOfDay(new Date())

  switch (preset) {
    case "hoje":
      return { from: today, to: addDays(today, 1) }
    case "amanha":
      return { from: addDays(today, 1), to: addDays(today, 2) }
    case "esta-semana": {
      const weekStart = addDays(today, -today.getDay()) // domingo
      return { from: weekStart, to: addDays(weekStart, 7) }
    }
    case "proxima-semana": {
      const nextWeekStart = addDays(today, 7 - today.getDay())
      return { from: nextWeekStart, to: addDays(nextWeekStart, 7) }
    }
    case "este-mes": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      return { from, to }
    }
    case "proximo-mes": {
      const from = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth() + 2, 1)
      return { from, to }
    }
    case "todas":
      return "any"
    case "custom": {
      const from = fromStr ? parseLocalDate(fromStr) : null
      const to = toStr ? parseLocalDate(toStr) : null
      if (!from && !to) return "any"
      return {
        from: from ?? new Date(0),
        // Até inclusivo: vai até o fim do dia informado.
        to: to ? addDays(to, 1) : new Date(8640000000000000),
      }
    }
    default:
      return null
  }
}

function fmtShort(s: string): string {
  const d = parseLocalDate(s)
  if (!d) return s
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}`
}

/** Rótulo do chip de filtro ativo. */
export function taskDateLabel(td?: string, fromStr?: string, toStr?: string): string | null {
  if (!td) return null
  if (td === "custom") {
    const f = fromStr ? fmtShort(fromStr) : ""
    const t = toStr ? fmtShort(toStr) : ""
    if (f && t) return `Tarefa: ${f} – ${t}`
    if (f) return `Tarefa: a partir de ${f}`
    if (t) return `Tarefa: até ${t}`
    return "Tarefa: período"
  }
  const p = TASK_DATE_PRESETS.find((x) => x.key === td)
  return p ? `Tarefa: ${p.label}` : null
}
