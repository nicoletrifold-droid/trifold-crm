"use client"

interface Props {
  sentToday: number
  quotaLimit: number
  deliveryRate: number
  openRate: number
  bounced24h: number
}

export function EmailStatsCards({
  sentToday,
  quotaLimit,
  deliveryRate,
  openRate,
  bounced24h,
}: Props) {
  const pct = Math.min((sentToday / quotaLimit) * 100, 100)
  const bounceIsDanger = sentToday > 0 && bounced24h / sentToday > 0.05

  const barColor =
    sentToday >= quotaLimit
      ? "bg-red-500"
      : sentToday >= quotaLimit * 0.9
        ? "bg-amber-500"
        : "bg-indigo-500"

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-xs text-stone-500 dark:text-stone-400">Enviados hoje</p>
        <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
          {sentToday}
          <span className="ml-1 text-sm font-normal text-stone-400">/ {quotaLimit}</span>
        </p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-stone-100 dark:bg-stone-800">
          <div
            className={`h-1.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-xs text-stone-500 dark:text-stone-400">Taxa de entrega</p>
        <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{deliveryRate}%</p>
        <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">entregues / enviados</p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-xs text-stone-500 dark:text-stone-400">Taxa de abertura</p>
        <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{openRate}%</p>
        <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">abertos / entregues</p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-xs text-stone-500 dark:text-stone-400">Bounces (24h)</p>
        <div className="mt-1 flex items-center gap-2">
          <p className={`text-2xl font-semibold ${bounceIsDanger ? "text-red-600" : "text-stone-900 dark:text-stone-100"}`}>
            {bounced24h}
          </p>
          {bounceIsDanger && (
            <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
              &gt;5%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
