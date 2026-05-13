export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando pipeline..."
      className="space-y-4"
    >
      <div className="h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="min-w-[240px] flex-1 space-y-2">
            <div className="h-8 animate-pulse rounded bg-gray-200 dark:bg-stone-800" />
            {Array.from({ length: 4 }).map((_, card) => (
              <div
                key={card}
                className="h-20 animate-pulse rounded bg-gray-100 dark:bg-stone-800/50"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
