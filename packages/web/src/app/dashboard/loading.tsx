export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando..."
      className="space-y-6"
    >
      {/* Title block */}
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
      </div>
      {/* 4 KPI cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-gray-100 dark:bg-stone-800/50" />
          </div>
        ))}
      </div>
      {/* Pipeline summary placeholder */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
        <div className="mt-4 h-16 w-full animate-pulse rounded bg-gray-100 dark:bg-stone-800/50" />
      </div>
    </div>
  )
}
