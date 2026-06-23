"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { TASK_DATE_PRESETS, taskDateLabel } from "@web/lib/broker/task-date-range"

/**
 * Filtro "Data da Tarefa" (Story 75-37) — popover com atalhos rápidos (Hoje, Amanhã,
 * Esta Semana, …, Todo Período) + intervalo personalizado De/Até. Espelha o filtro do
 * antigo CRM Supremo. Controla os params de URL `td` / `tdfrom` / `tdto`.
 */
export function TaskDateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const td = searchParams.get("td") ?? ""
  const tdfrom = searchParams.get("tdfrom") ?? ""
  const tdto = searchParams.get("tdto") ?? ""

  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(tdfrom)
  const [to, setTo] = useState(tdto)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const navigate = (next: { td?: string; tdfrom?: string; tdto?: string } | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("td")
    params.delete("tdfrom")
    params.delete("tdto")
    params.delete("page")
    if (next?.td) params.set("td", next.td)
    if (next?.tdfrom) params.set("tdfrom", next.tdfrom)
    if (next?.tdto) params.set("tdto", next.tdto)
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const activeLabel = taskDateLabel(td, tdfrom, tdto)
  const buttonClass = `h-8 rounded-lg border px-2.5 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 dark:focus:ring-orange-500 ${
    activeLabel
      ? "border-orange-400 bg-orange-500/10 text-orange-500 dark:border-orange-500 dark:text-orange-400"
      : "border-gray-300 bg-white text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
  }`

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={buttonClass}>
        {activeLabel ?? "Data da Tarefa"}
        <span className="ml-1.5 text-[10px] opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <div className="grid grid-cols-2 gap-1.5">
            {TASK_DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => navigate({ td: p.key })}
                className={`rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  td === p.key
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-stone-700">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-stone-400">
              Intervalo personalizado
            </p>
            <div className="flex items-center gap-1.5">
              <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-gray-500 dark:text-stone-400">
                De
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                />
              </label>
              <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-gray-500 dark:text-stone-400">
                Até
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                />
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setFrom("")
                  setTo("")
                  navigate(null)
                }}
                className="text-xs text-stone-500 underline underline-offset-2 hover:text-orange-400"
              >
                Limpar
              </button>
              <button
                type="button"
                disabled={!from && !to}
                onClick={() => navigate({ td: "custom", tdfrom: from, tdto: to })}
                className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
