"use client"

import { useState } from "react"
import Image from "next/image"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const badgeClass = CHAMADO_STATUS_BADGE[chamado.status] ?? CHAMADO_STATUS_BADGE.aberto
  const label = CHAMADO_STATUS_LABEL[chamado.status] ?? chamado.status

  const urls =
    chamado.image_urls && chamado.image_urls.length > 0
      ? chamado.image_urls
      : chamado.image_url
      ? [chamado.image_url]
      : []

  const closeLightbox = () => setLightboxIndex(null)

  return (
    <>
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start gap-4">
          {/* Thumbnails */}
          {urls.length > 0 && (
            <div className="flex flex-shrink-0 flex-col gap-1">
              {urls.slice(0, 3).map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-stone-200 transition-opacity hover:opacity-80 dark:border-stone-700"
                >
                  <Image
                    src={url}
                    alt={`Screenshot ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </button>
              ))}
              {urls.length > 3 && (
                <span className="text-center text-[10px] text-stone-400">+{urls.length - 3}</span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
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

            <p className="mb-1 line-clamp-3 text-sm text-stone-700 dark:text-stone-300">
              {chamado.description}
            </p>

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

      {/* Lightbox */}
      {lightboxIndex !== null && urls[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={closeLightbox}
        >
          {/* Fecha ao clicar fora */}
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={urls[lightboxIndex]}
              alt={`Screenshot ${lightboxIndex + 1}`}
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
            />

            {/* Fechar */}
            <button
              onClick={closeLightbox}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700"
              aria-label="Fechar"
            >
              <X className="h-4 w-4 text-stone-700 dark:text-stone-200" />
            </button>

            {/* Navegação entre imagens */}
            {urls.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex((i) => ((i ?? 0) - 1 + urls.length) % urls.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white dark:bg-stone-800/90 dark:hover:bg-stone-800"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-4 w-4 text-stone-700 dark:text-stone-200" />
                </button>
                <button
                  onClick={() => setLightboxIndex((i) => ((i ?? 0) + 1) % urls.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white dark:bg-stone-800/90 dark:hover:bg-stone-800"
                  aria-label="Próxima"
                >
                  <ChevronRight className="h-4 w-4 text-stone-700 dark:text-stone-200" />
                </button>
                <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {lightboxIndex + 1} / {urls.length}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
