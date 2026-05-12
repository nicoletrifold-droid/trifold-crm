export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando conversas..."
      className="space-y-4"
    >
      <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm"
          >
            <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-full max-w-xs animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
