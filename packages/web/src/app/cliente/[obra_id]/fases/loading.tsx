export default function FasesLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando fases..."
      className="min-h-screen bg-stone-950"
    >
      {/* Mobile header placeholder */}
      <div className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950 lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4 space-y-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-stone-800" />
          <div className="h-4 w-36 animate-pulse rounded bg-stone-800" />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        {/* Cronograma card skeleton */}
        <div className="mb-6 rounded-2xl border border-stone-800 bg-stone-900 p-5 space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-stone-800" />
          <div className="flex justify-between">
            <div className="h-3 w-24 animate-pulse rounded bg-stone-800" />
            <div className="h-3 w-10 animate-pulse rounded bg-stone-800" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-stone-800" />
        </div>

        {/* Phase cards skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-stone-700/40"
            >
              {/* Group header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-stone-800/40">
                <div className="h-4 w-32 animate-pulse rounded bg-stone-700" />
              </div>
              {/* Phase items */}
              <div className="divide-y divide-stone-800 bg-stone-900">
                {Array.from({ length: i === 1 ? 2 : 1 }).map((_, j) => (
                  <div key={j} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="h-4 w-48 animate-pulse rounded bg-stone-800" />
                      <div className="h-5 w-20 animate-pulse rounded-full bg-stone-800" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <div className="h-3 w-16 animate-pulse rounded bg-stone-800" />
                        <div className="h-3 w-8 animate-pulse rounded bg-stone-800" />
                      </div>
                      <div className="h-1.5 w-full animate-pulse rounded-full bg-stone-800" />
                    </div>
                    <div className="flex gap-6">
                      <div className="space-y-1">
                        <div className="h-3 w-16 animate-pulse rounded bg-stone-800" />
                        <div className="h-3 w-10 animate-pulse rounded bg-stone-800" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 animate-pulse rounded bg-stone-800" />
                        <div className="h-3 w-10 animate-pulse rounded bg-stone-800" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
