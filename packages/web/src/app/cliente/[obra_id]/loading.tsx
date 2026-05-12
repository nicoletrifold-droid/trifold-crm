export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando obra..."
      className="min-h-screen bg-stone-950"
    >
      {/* Mobile header placeholder */}
      <div className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div className="space-y-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-stone-800" />
            <div className="h-4 w-32 animate-pulse rounded bg-stone-800" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-lg bg-stone-800" />
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-6 lg:py-8">
        {/* Hero card */}
        <div className="mb-5 space-y-4 rounded-2xl bg-stone-900 p-6 ring-1 ring-inset ring-stone-800 lg:p-8">
          <div className="h-3 w-16 animate-pulse rounded bg-stone-800" />
          <div className="h-8 w-48 animate-pulse rounded bg-stone-800" />
          <div className="h-3 w-full animate-pulse rounded bg-stone-800" />
          <div className="h-3 w-24 animate-pulse rounded bg-stone-800" />
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl bg-stone-900 p-5 ring-1 ring-inset ring-stone-800"
            >
              <div className="h-4 w-24 animate-pulse rounded bg-stone-800" />
              <div className="h-20 w-full animate-pulse rounded bg-stone-800" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
