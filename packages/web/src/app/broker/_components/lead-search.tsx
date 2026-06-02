"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback, useState } from "react"
import { Search, X } from "lucide-react"

export function LeadSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get("q") ?? "")

  const apply = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (q.trim()) {
        params.set("q", q.trim())
      } else {
        params.delete("q")
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply(value)}
        placeholder="Buscar por nome, e-mail, telefone…"
        className="h-9 w-64 rounded-lg border border-stone-200 bg-white pl-9 pr-8 text-sm text-stone-700 placeholder-stone-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:placeholder-stone-500"
      />
      {value && (
        <button
          onClick={() => { setValue(""); apply("") }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
