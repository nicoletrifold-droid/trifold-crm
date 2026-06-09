import Image from "next/image"
import { CHAMADO_STATUS_BADGE, CHAMADO_STATUS_LABEL } from "@web/lib/status-badge"

interface ChamadoCardProps {
  chamado: {
    id: string
    description: string
    reason: string
    image_url: string | null
    image_urls?: string[] | null
    status: string
    reporter_name: string
    created_at: string
  }
  showReporter?: boolean
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

export function ChamadoCard({ chamado, showReporter = false }: ChamadoCardProps) {
  const badgeClass =
    CHAMADO_STATUS_BADGE[chamado.status] ?? CHAMADO_STATUS_BADGE.aberto
  const label =
    CHAMADO_STATUS_LABEL[chamado.status] ?? chamado.status

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start gap-4">
        {/* Thumbnails das imagens */}
        {(() => {
          const urls =
            chamado.image_urls && chamado.image_urls.length > 0
              ? chamado.image_urls
              : chamado.image_url
              ? [chamado.image_url]
              : []
          if (urls.length === 0) return null
          return (
            <div className="flex flex-shrink-0 flex-col gap-1">
              {urls.slice(0, 3).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
                    <Image
                      src={url}
                      alt={`Screenshot ${i + 1}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                </a>
              ))}
              {urls.length > 3 && (
                <span className="text-center text-[10px] text-stone-400">
                  +{urls.length - 3}
                </span>
              )}
            </div>
          )
        })()}

        <div className="min-w-0 flex-1">
          {/* Header: data + status badge */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {formatDate(chamado.created_at)}
              </span>
              {showReporter && (
                <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
                  {chamado.reporter_name}
                </span>
              )}
            </div>
            <span
              className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}
            >
              {label}
            </span>
          </div>

          {/* Descrição */}
          <p className="mb-1 line-clamp-3 text-sm text-stone-700 dark:text-stone-300">
            {chamado.description}
          </p>

          {/* Motivo */}
          <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 dark:bg-stone-800/60">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Motivo
            </p>
            <p className="line-clamp-2 text-xs text-stone-600 dark:text-stone-400">
              {chamado.reason}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
