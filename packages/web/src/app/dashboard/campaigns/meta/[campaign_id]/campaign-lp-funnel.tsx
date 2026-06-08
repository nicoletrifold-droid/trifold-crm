"use client"

import type { MetaInsightTimeSeries } from "@trifold/shared"

interface Props {
  timeseries: MetaInsightTimeSeries[]
}

function pct(a: number, b: number): string {
  if (b === 0) return "—"
  return `${((a / b) * 100).toFixed(1)}%`
}

export default function CampaignLpFunnel({ timeseries }: Props) {
  const impressions     = timeseries.reduce((s, r) => s + r.impressions, 0)
  const outboundClicks  = timeseries.reduce((s, r) => s + r.outbound_clicks, 0)
  const lpViews         = timeseries.reduce((s, r) => s + r.landing_page_views, 0)
  const leadsMeta       = timeseries.reduce((s, r) => s + r.leads_meta, 0)

  if (impressions === 0 && outboundClicks === 0) {
    return (
      <p className="text-sm text-gray-400 italic">Dados de LP não disponíveis para este período.</p>
    )
  }

  const lpRate    = outboundClicks > 0 ? (lpViews / outboundClicks) * 100 : null
  const lpWarning = lpRate !== null && lpRate < 50

  const stages = [
    { label: "Impressões",      value: impressions,    prev: null,          tooltip: "Total de vezes que o anúncio foi exibido" },
    { label: "Cliques externos", value: outboundClicks, prev: impressions,   tooltip: "Cliques que saíram do Meta (outbound_clicks)" },
    { label: "Viram a LP",      value: lpViews,        prev: outboundClicks, tooltip: "Visitantes que efetivamente carregaram a landing page" },
    { label: "Leads gerados",   value: leadsMeta,      prev: lpViews,       tooltip: "Leads capturados via formulário Meta" },
  ]

  return (
    <div className="space-y-3">
      {lpWarning && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Taxa LP baixa ({lpRate!.toFixed(1)}%) — possível lentidão ou erro na landing page.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.map((stage, i) => {
          const convRate = stage.prev !== null ? pct(stage.value, stage.prev) : null
          const isBottleneck = lpWarning && stage.label === "Viram a LP"
          return (
            <div
              key={stage.label}
              className={`relative rounded-lg border p-4 ${
                isBottleneck
                  ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
                  : "border-gray-200 bg-gray-50 dark:border-stone-700 dark:bg-stone-800/50"
              }`}
              title={stage.tooltip}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                {stage.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
                {stage.value.toLocaleString("pt-BR")}
              </p>
              {convRate !== null && (
                <p className={`mt-1 text-xs ${isBottleneck ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-500 dark:text-stone-400"}`}>
                  Conversão: {convRate}
                </p>
              )}
              {i < stages.length - 1 && (
                <div className="hidden sm:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 text-gray-300 dark:text-stone-600 text-xl">
                  ›
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
