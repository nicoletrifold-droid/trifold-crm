/**
 * Story 50-2 (Epic 50): CreativePreviewModal
 *
 * Modal/Sheet responsivo aberto ao clicar no CreativeChip.
 * - Desktop (≥640px): modal centralizado
 * - Mobile (<640px): bottom sheet com drag handle
 *
 * Design spec autoritativo: docs/assets/design-specs/50-2-creative-chip-design-spec.md
 *
 * A11y:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Esc closes (keyboard handler)
 *   - Backdrop click closes
 *   - Close button com aria-label
 */
"use client"

import { useEffect } from "react"
import Link from "next/link"
import { X, ExternalLink } from "lucide-react"

interface CreativePreviewModalProps {
  open: boolean
  onClose: () => void
  adId: string
  adName: string
  campaignName: string | null
  thumbnailUrl: string | null
  imageUrl: string | null
  metaCampaignId?: string | null
}

export function CreativePreviewModal({
  open,
  onClose,
  adId,
  adName,
  campaignName,
  thumbnailUrl,
  imageUrl,
  metaCampaignId,
}: CreativePreviewModalProps) {
  // Esc closes (a11y AC9)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const displayUrl = imageUrl ?? thumbnailUrl
  // QA OBS-005: encodeURIComponent para defense-in-depth no deeplink
  // (valores vêm de Meta API, não user input, mas é boa prática preventiva)
  const encodedAdId = encodeURIComponent(adId)
  const deeplink = metaCampaignId
    ? `/dashboard/campaigns/meta/${encodeURIComponent(metaCampaignId)}?ad_id=${encodedAdId}`
    : `/dashboard/campaigns/meta?ad_id=${encodedAdId}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="creative-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet (mobile) / Modal (desktop) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl dark:bg-stone-900 sm:max-w-md sm:rounded-2xl"
      >
        {/* Drag handle (mobile only) */}
        <div className="mb-3 flex justify-center sm:hidden">
          <div className="h-1 w-9 rounded-full bg-stone-300 dark:bg-stone-700" />
        </div>

        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="creative-modal-title"
            className="text-sm font-semibold text-stone-900 dark:text-stone-100"
          >
            Criativo
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image */}
        {displayUrl && (
          <div className="mb-4 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- Meta CDN dynamic URLs com tokens expiráveis */}
            <img
              src={displayUrl}
              alt={`${adName} — anúncio Meta`}
              className="h-auto w-full object-contain"
              style={{ maxHeight: "60vh" }}
            />
          </div>
        )}

        {/* Metadata */}
        <div className="mb-4 space-y-1">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{adName}</p>
          {campaignName && (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Campanha:{" "}
              <span className="text-stone-700 dark:text-stone-300">{campaignName}</span>
            </p>
          )}
        </div>

        {/* CTA */}
        <Link
          href={deeplink}
          onClick={onClose}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Ver no painel de campanhas
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
