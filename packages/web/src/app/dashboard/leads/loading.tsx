export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando leads..."
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-9 w-24 animate-pulse rounded-md bg-gray-200" />
      </div>
      {/* Search/filter row */}
      <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-gray-100" />
      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="h-10 animate-pulse bg-gray-50" />
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse bg-gray-50" />
          ))}
        </div>
      </div>
    </div>
  )
}
