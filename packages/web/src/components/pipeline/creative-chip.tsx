/**
 * Story 50-2 (Epic 50): CreativeChip
 *
 * Botão compacto exibido no LeadCard quando há criativo Meta resolvido para o lead.
 * Substitui (não soma) o SourceBadge quando creative está disponível.
 *
 * Comportamento:
 *   - Com thumbnailUrl válida → miniatura + nome do anúncio
 *   - Sem thumbnailUrl ou erro de carga → modo texto (ícone Meta + nome do anúncio)
 *   - Click abre CreativePreviewModal (gestão de estado fica no pai)
 *   - e.stopPropagation + onPointerDown stopPropagation → evita conflito com dnd-kit
 */
"use client"

import { useState } from "react"

interface CreativeChipProps {
  adId: string
  adName: string
  campaignName?: string
  thumbnailUrl?: string
  imageUrl?: string
  onPreviewClick?: (adId: string) => void
}

export function CreativeChip({
  adId,
  adName,
  campaignName,
  thumbnailUrl,
  onPreviewClick,
}: CreativeChipProps) {
  const [imgError, setImgError] = useState(false)

  const showImage = thumbnailUrl && !imgError

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onPreviewClick?.(adId)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={campaignName ? `${adName} · ${campaignName}` : adName}
      aria-label={`Ver criativo ${adName}${campaignName ? ` da campanha ${campaignName}` : ""}`}
      className="group inline-flex shrink-0 items-center gap-1 rounded-md border border-transparent bg-blue-50 px-1 py-0.5 transition-colors hover:border-blue-200 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:bg-blue-500/15 dark:hover:border-blue-700 dark:hover:bg-blue-500/25 dark:focus-visible:ring-offset-stone-900"
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element -- Meta CDN dynamic URLs are not eligible for next/image optimization (tokens expiram, dimensões variáveis) */
        <img
          src={thumbnailUrl}
          alt={`${adName} — anúncio Meta`}
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-6 w-6 shrink-0 rounded object-cover sm:h-7 sm:w-7"
        />
      ) : (
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3 w-3 shrink-0 text-blue-500 dark:text-blue-400"
          aria-hidden="true"
        >
          <path d="M8 0C3.582 0 0 3.582 0 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm3.914 5.5h-1.336c-.52 0-.664.246-.664.75V7h2l-.266 2H9.914v5.5H7.75V9H6.5V7h1.25V6.082C7.75 4.582 8.664 3.5 10.25 3.5c.727 0 1.664.055 1.664.055V5.5z" />
        </svg>
      )}
      <span className="max-w-[100px] truncate text-[10px] font-medium text-blue-700 dark:text-blue-300 sm:max-w-[120px]">
        {adName}
      </span>
    </button>
  )
}
