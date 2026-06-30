"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"

const PRESETS: { value: string; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "custom", label: "Custom" },
]

/**
 * Seletor de PERÍODO global do Analytics (Story 75-31). Escreve `range`/`from`/`to`
 * na URL — o Server Component recalcula a página inteira. Substitui os botões de
 * preset que ficavam dentro do gráfico.
 */
export function AnalyticsPeriodSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const range = searchParams.get("range") ?? "30d"
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(next)) {
        if (v) params.set(k, v)
        else params.delete(k)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const selectRange = (value: string) => {
    if (value === "custom") setParams({ range: "custom" })
    else setParams({ range: value, from: null, to: null })
  }

  const btn = (active: boolean) =>
    `px-3 py-1.5 text-sm transition-colors ${
      active
        ? "bg-orange-500 text-white font-medium"
        : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
    }`

  const dateInput =
    "rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-stone-500 dark:text-stone-400">Período:</span>
      <div className="flex overflow-hidden rounded-md border border-gray-200 dark:border-stone-800">
        {PRESETS.map((p) => (
          <button key={p.value} onClick={() => selectRange(p.value)} className={btn(range === p.value)}>
            {p.label}
          </button>
        ))}
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-gray-600 dark:text-stone-400">De:</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setParams({ range: "custom", from: e.target.value })}
            className={dateInput}
          />
          <label className="text-gray-600 dark:text-stone-400">Até:</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setParams({ range: "custom", to: e.target.value })}
            className={dateInput}
          />
        </div>
      )}
    </div>
  )
}
