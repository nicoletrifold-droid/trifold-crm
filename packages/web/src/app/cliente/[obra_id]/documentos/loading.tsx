export default function DocumentosLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando documentos..."
      className="min-h-screen bg-stone-950"
    >
      {/* Mobile header placeholder */}
      <div className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950 lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4 space-y-1.5">
          <div className="h-3 w-20 animate-pulse rounded bg-stone-800" />
          <div className="h-4 w-36 animate-pulse rounded bg-stone-800" />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        {/* Category pills skeleton */}
        <div className="mb-5 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`h-8 animate-pulse rounded-full bg-stone-800 ${i === 0 ? "w-16" : i === 1 ? "w-24" : "w-20"}`}
            />
          ))}
        </div>

        {/* Documents list skeleton */}
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3.5"
            >
              {/* Icon */}
              <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-lg bg-stone-800" />

              {/* Info */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-stone-800" />
                <div className="flex gap-2">
                  <div className="h-4 w-16 animate-pulse rounded-full bg-stone-800" />
                  <div className="h-4 w-10 animate-pulse rounded bg-stone-800" />
                </div>
              </div>

              {/* Download button skeleton */}
              <div className="h-9 w-20 flex-shrink-0 animate-pulse rounded-lg bg-stone-800" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
