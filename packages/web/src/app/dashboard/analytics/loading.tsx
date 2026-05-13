export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando analytics..."
      className="space-y-6"
    >
      <div className="h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
            <div className="mt-3 h-8 w-20 animate-pulse rounded bg-gray-100 dark:bg-stone-800/50" />
          </div>
        ))}
      </div>
      {/* Chart placeholder */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
        <div className="h-64 w-full animate-pulse rounded bg-gray-100 dark:bg-stone-800/50" />
      </div>
      {/* Secondary KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <div className="h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
            <div className="mt-3 h-32 w-full animate-pulse rounded bg-gray-100 dark:bg-stone-800/50" />
          </div>
        ))}
      </div>
    </div>
  )
}
