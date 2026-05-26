export default function ChamadosLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-stone-200 dark:bg-stone-800" />
        <div className="space-y-2">
          <div className="h-5 w-48 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-3.5 w-64 rounded bg-stone-200 dark:bg-stone-800" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Form skeleton */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-5 h-5 w-40 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="space-y-4">
            <div className="h-24 rounded-xl bg-stone-200 dark:bg-stone-800" />
            <div className="h-24 rounded-xl bg-stone-200 dark:bg-stone-800" />
            <div className="h-20 rounded-xl bg-stone-200 dark:bg-stone-800" />
            <div className="h-12 rounded-xl bg-stone-200 dark:bg-stone-800" />
          </div>
        </div>

        {/* List skeleton */}
        <div className="space-y-3">
          <div className="mb-4 h-5 w-36 rounded bg-stone-200 dark:bg-stone-800" />
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex gap-4">
                <div className="h-20 w-20 flex-shrink-0 rounded-lg bg-stone-200 dark:bg-stone-800" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-24 rounded bg-stone-200 dark:bg-stone-800" />
                    <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-800" />
                  </div>
                  <div className="h-3 w-full rounded bg-stone-200 dark:bg-stone-800" />
                  <div className="h-3 w-3/4 rounded bg-stone-200 dark:bg-stone-800" />
                  <div className="h-10 rounded-md bg-stone-100 dark:bg-stone-800/60" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
