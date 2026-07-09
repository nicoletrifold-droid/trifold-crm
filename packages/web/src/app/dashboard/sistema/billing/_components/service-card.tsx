import { ExternalLink, AlertTriangle } from "lucide-react"
import {
  type ServiceSummary,
  STATUS_STYLES,
  formatMoneyList,
  relativeTime,
} from "./shared"

/**
 * Card de um serviço da plataforma (Story 78-9 — AC2/AC3):
 * nome + categoria, badge de status de coleta, gasto do mês na moeda de origem,
 * "atualizado há X" e deep-link para o billing (com aviso quando URL não confirmada).
 */
export function ServiceCard({ service }: { service: ServiceSummary }) {
  const status = STATUS_STYLES[service.collection_status]

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
            {service.name}
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">{service.category}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${status.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      <div>
        <p className="text-xs text-stone-500 dark:text-stone-400">Gasto do mês</p>
        <p className="mt-0.5 text-lg font-semibold text-stone-900 dark:text-stone-100">
          {formatMoneyList(service.month_costs)}
        </p>
        <p className="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
          atualizado {relativeTime(service.last_collected_at)}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
        <a
          href={service.billing_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#E8856A] hover:underline"
        >
          Abrir billing
          <ExternalLink className="h-3 w-3" />
        </a>
        {!service.billing_url_confirmed && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            title="URL de billing de melhor esforço — pode precisar de ajuste manual (slug de org/time não confirmado)."
          >
            <AlertTriangle className="h-3 w-3" />
            Link não confirmado
          </span>
        )}
      </div>
    </div>
  )
}
