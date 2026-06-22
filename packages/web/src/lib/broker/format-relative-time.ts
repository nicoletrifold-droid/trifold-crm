/**
 * Story 63-17 (Epic 63 Fase 6) — Formatação de timestamp relativo estilo
 * WhatsApp para os cards da inbox de conversas do corretor.
 *
 * Helper PURO (sem dependências de React/Next). Recebe `now` opcional para
 * testabilidade determinística.
 *
 * Regras (comparação por DIA de calendário, não por janela de 24h):
 * - Mesmo dia (ou futuro) → "HH:mm"   (ex.: "14:32")
 * - Dia anterior          → "Ontem"
 * - 2 a 6 dias atrás       → nome curto do dia (Seg, Ter, Qua, Qui, Sex, Sáb, Dom)
 * - 7+ dias atrás          → "dd/MM/aa" (ex.: "15/06/26")
 */

const SHORT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const

const DAY_MS = 24 * 60 * 60 * 1000

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  // Diferença em dias de calendário (positivo = passado).
  const diffDays = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / DAY_MS)

  // Mesmo dia ou futuro → hora.
  if (diffDays <= 0) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  if (diffDays === 1) {
    return "Ontem"
  }

  if (diffDays >= 2 && diffDays <= 6) {
    // getDay() é sempre 0-6 → índice sempre válido.
    return SHORT_WEEKDAYS[date.getDay()] ?? ""
  }

  // 7+ dias → data curta dd/MM/aa.
  const dd = pad2(date.getDate())
  const mm = pad2(date.getMonth() + 1)
  const yy = pad2(date.getFullYear() % 100)
  return `${dd}/${mm}/${yy}`
}
