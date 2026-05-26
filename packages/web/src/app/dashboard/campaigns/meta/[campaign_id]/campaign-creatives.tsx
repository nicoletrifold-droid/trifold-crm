"use client"

import { useCallback, useEffect, useState } from "react"
import { formatBRL, formatNumber, formatPercent } from "@web/lib/meta-format"
import { STATUS_BADGES } from "@web/lib/meta-constants"

interface AdCreativeMetrics {
  ad_id: string
  ad_name: string
  status: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
  cpc: number | null
  leads: number
  cpl: number | null
  ctr_last_3d: number
  ctr_prev_7d: number
  spend_3d: number
  is_fatigued: boolean
  fatigue_drop_pct: number | null
  thumbnail_url: string | null
  ad_body: string | null
}

interface CreativesApiResponse {
  ads: AdCreativeMetrics[]
  fatigued_count: number
  period_days: number
}

interface Props {
  campaignId: string
  period: string
}

const FATIGUE_TOOLTIP =
  "CTR dos últimos 3 dias caiu mais de 40% em relação aos 7 dias anteriores, com spend mínimo de R$30 no período de análise."

export default function CampaignCreatives({ campaignId, period }: Props) {
  const [data, setData] = useState<CreativesApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `/api/meta-ads/campaigns/${encodeURIComponent(campaignId)}/creatives?period=${period}`,
        { cache: "no-store" },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as CreativesApiResponse
      setData(json)
    } catch {
      setError(true)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [campaignId, period])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-md bg-gray-100" />
        <div className="h-24 animate-pulse rounded-md bg-gray-100" />
        <div className="h-24 animate-pulse rounded-md bg-gray-100" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
        Não foi possível carregar os criativos.
      </div>
    )
  }

  if (data.ads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
        Nenhum dado de criativo disponível. Aguarde o próximo sync (máx. 4h).
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.fatigued_count > 0 && (
        <p className="text-sm text-red-700">
          <span className="font-semibold">{data.fatigued_count}</span>{" "}
          {data.fatigued_count === 1
            ? "criativo com sinal de fadiga"
            : "criativos com sinal de fadiga"}
          .
        </p>
      )}
      {data.ads.map((ad) => (
        <CreativeCard key={ad.ad_id} ad={ad} />
      ))}
    </div>
  )
}

function CreativeCard({ ad }: { ad: AdCreativeMetrics }) {
  const [thumbBroken, setThumbBroken] = useState(false)
  const badge = STATUS_BADGES[ad.status] ?? STATUS_BADGES.ARCHIVED!

  const showThumb = !!ad.thumbnail_url && !thumbBroken

  return (
    <div
      className={`flex flex-col lg:flex-row gap-4 rounded-lg border bg-white p-4 shadow-sm ${
        ad.is_fatigued ? "border-red-300" : "border-gray-200"
      }`}
    >
      {/* Thumbnail — hidden on mobile (< lg) to preserve metric legibility */}
      <div className="hidden lg:block shrink-0">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- meta CDN thumbnails have TTL; using <img> avoids Next/image optimizer 404 cascades
          <img
            src={ad.thumbnail_url ?? ""}
            alt={ad.ad_name || "Criativo"}
            width={64}
            height={64}
            className="h-16 w-16 rounded object-cover bg-gray-100"
            onError={() => setThumbBroken(true)}
          />
        ) : (
          <ThumbnailPlaceholder />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className="text-sm font-semibold text-gray-900 truncate"
            title={ad.ad_name}
          >
            {ad.ad_name || "Sem nome"}
          </h3>
          <span
            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {ad.is_fatigued && ad.fatigue_drop_pct !== null && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 cursor-help"
              title={FATIGUE_TOOLTIP}
              role="status"
              aria-label={`Sinal de fadiga: CTR caiu ${ad.fatigue_drop_pct}%`}
            >
              <span aria-hidden="true">⚠️</span>
              Fadiga — CTR caiu {ad.fatigue_drop_pct}%
            </span>
          )}
        </div>

        {ad.ad_body && (
          <p
            className="mt-1 text-xs text-gray-500 line-clamp-2"
            title={ad.ad_body}
          >
            {ad.ad_body}
          </p>
        )}

        {/* Metrics grid */}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Spend" value={formatBRL(ad.spend)} />
          <Metric label="Impressões" value={formatNumber(ad.impressions)} />
          <Metric label="CTR" value={formatPercent(ad.ctr)} />
          <Metric label="CPM" value={formatBRL(ad.cpm)} />
          <Metric label="Leads" value={formatNumber(ad.leads)} />
          <Metric
            label="CPL"
            value={ad.cpl !== null ? formatBRL(ad.cpl) : "—"}
          />
        </dl>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  )
}

function ThumbnailPlaceholder() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sem prévia do criativo"
      className="h-16 w-16 rounded bg-gray-100 text-gray-400"
    >
      <rect width="64" height="64" rx="6" fill="currentColor" opacity="0.15" />
      <path
        d="M16 44l10-12 8 9 6-6 8 9H16z"
        fill="currentColor"
        opacity="0.5"
      />
      <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.5" />
    </svg>
  )
}
