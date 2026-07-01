import { Clock } from "lucide-react"

/**
 * "⏱ aguardando há X" — tempo (horário comercial) que um lead está esperando
 * atendimento. Cor escala com o SLA: ≤30 âmbar, ≤60 laranja, >60 vermelho.
 * Compartilhado entre a lista do corretor (Story 75-49) e o kanban do dashboard (75-91).
 * Renderiza null quando `minutes` é null/undefined (lead já atendido / sem dado).
 */
export function WaitingBadge({ minutes }: { minutes: number | null | undefined }) {
  if (minutes == null) return null
  const label =
    minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`
  const tone =
    minutes <= 30
      ? "text-amber-600 dark:text-amber-400"
      : minutes <= 60
      ? "text-orange-600 dark:text-orange-400"
      : "text-red-600 dark:text-red-400"
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${tone}`}
      title="Tempo aguardando atendimento (horário comercial)"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      aguardando há {label}
    </span>
  )
}
