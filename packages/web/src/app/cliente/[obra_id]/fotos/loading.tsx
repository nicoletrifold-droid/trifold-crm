export default function FotosLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando fotos..."
      className="min-h-screen bg-stone-950"
    >
      {/* Mobile header placeholder */}
      <div className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950 lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4 space-y-1.5">
          <div className="h-3 w-28 animate-pulse rounded bg-stone-800" />
          <div className="h-4 w-36 animate-pulse rounded bg-stone-800" />
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-6 lg:py-8">
        {/* Filter pills skeleton */}
        <div className="mb-5 flex gap-2 pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`h-8 animate-pulse rounded-full bg-stone-800 ${i === 0 ? "w-28" : "w-20"}`}
            />
          ))}
        </div>

        {/* Photos grid skeleton */}
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, groupIdx) => (
            <section key={groupIdx}>
              {/* Section header */}
              <div className="mb-3 flex items-center gap-2">
                <div className="h-5 w-32 animate-pulse rounded bg-stone-800" />
                <div className="h-5 w-12 animate-pulse rounded-full bg-stone-800" />
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: groupIdx === 0 ? 6 : 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-xl bg-stone-900"
                  >
                    <div className="aspect-square w-full animate-pulse bg-stone-800 sm:aspect-video" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
