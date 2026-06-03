/**
 * Story 50-2 (Epic 50): CreativeChip
 *
 * Botão compacto exibido no LeadCard quando há criativo Meta resolvido para o lead.
 * Substitui (não soma) o SourceBadge quando creative está disponível.
 *
 * Design spec autoritativo: docs/assets/design-specs/50-2-creative-chip-design-spec.md
 *
 * Comportamento:
 *   - Sem thumbnailUrl OU erro de carga → retorna null (pai renderiza fallback)
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

  // Degradação graciosa: sem thumbnail ou erro → pai usa SourceBadge fallback
  if (!thumbnailUrl || imgError) return null

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
      className="group inline-flex shrink-0 items-center gap-1 rounded-md border border-transparent bg-stone-50 px-1 py-0.5 transition-colors hover:border-stone-200 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:bg-stone-800/60 dark:hover:border-stone-700 dark:hover:bg-stone-800 dark:focus-visible:ring-offset-stone-900"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Meta CDN dynamic URLs are not eligible for next/image optimization (tokens expiram, dimensões variáveis) */}
      <img
        src={thumbnailUrl}
        alt={`${adName} — anúncio Meta`}
        loading="lazy"
        onError={() => setImgError(true)}
        className="h-6 w-6 shrink-0 rounded object-cover sm:h-7 sm:w-7"
      />
      <span className="max-w-[100px] truncate text-[10px] font-medium text-stone-600 dark:text-stone-300 sm:max-w-[120px]">
        {adName}
      </span>
    </button>
  )
}
