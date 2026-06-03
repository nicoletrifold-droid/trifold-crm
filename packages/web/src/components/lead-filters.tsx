"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"

interface Stage {
  id: string
  name: string
  color: string | null
}

interface Property {
  id: string
  name: string
}

interface LeadFiltersProps {
  stages: Stage[]
  properties: Property[]
  stageParam?: string
  propertyParam?: string
  daysParam?: string
}

export function LeadFilters({
  stages,
  properties,
  stageParam = "stage",
  propertyParam = "property",
  daysParam = "days",
}: LeadFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStage = searchParams.get(stageParam) ?? ""
  const activeProperty = searchParams.get(propertyParam) ?? ""
  const activeDays = searchParams.get(daysParam) ?? ""

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const selectClass =
    "h-8 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-0 text-xs text-stone-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 border-gray-300 bg-white text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"

  const hasFilters = activeStage || activeProperty || activeDays

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Etapa */}
      <select
        value={activeStage}
        onChange={(e) => setParam(stageParam, e.target.value)}
        className={selectClass}
      >
        <option value="">Etapa: Todas</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Empreendimento */}
      {properties.length > 0 && (
        <select
          value={activeProperty}
          onChange={(e) => setParam(propertyParam, e.target.value)}
          className={selectClass}
        >
          <option value="">Empreendimento: Todos</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {/* Sem contato */}
      <select
        value={activeDays}
        onChange={(e) => setParam(daysParam, e.target.value)}
        className={selectClass}
      >
        <option value="">Sem contato: Qualquer</option>
        <option value="3">Parado 3+ dias</option>
        <option value="7">Parado 7+ dias</option>
        <option value="30">Parado 30+ dias</option>
      </select>

      {/* Limpar */}
      {hasFilters && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete(stageParam)
            params.delete(propertyParam)
            params.delete(daysParam)
            params.delete("page")
            router.push(`${pathname}?${params.toString()}`)
          }}
          className="text-xs text-stone-500 hover:text-orange-400 underline underline-offset-2"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
