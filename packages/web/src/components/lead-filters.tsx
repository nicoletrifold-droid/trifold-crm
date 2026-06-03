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

const DAYS_OPTIONS = [
  { label: "3+ dias", value: "3" },
  { label: "7+ dias", value: "7" },
  { label: "30+ dias", value: "30" },
]

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
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const chipBase = "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer border"
  const chipActive = "border-orange-500 bg-orange-500/15 text-orange-400"
  const chipInactive = "border-stone-700 bg-transparent text-stone-400 hover:border-stone-500 hover:text-stone-200"

  const hasFilters = activeStage || activeProperty || activeDays

  return (
    <div className="space-y-2">
      {/* Etapa */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-stone-500 w-20">Etapa</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setParam(stageParam, "")}
            className={`${chipBase} ${!activeStage ? chipActive : chipInactive}`}
          >
            Todas
          </button>
          {stages.map((s) => (
            <button
              key={s.id}
              onClick={() => setParam(stageParam, activeStage === s.id ? "" : s.id)}
              className={`${chipBase} ${activeStage === s.id ? chipActive : chipInactive}`}
              style={activeStage === s.id ? undefined : { borderColor: s.color ? `${s.color}50` : undefined }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle"
                style={{ backgroundColor: s.color ?? "#888" }}
              />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Empreendimento */}
      {properties.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-stone-500 w-20">Produto</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setParam(propertyParam, "")}
              className={`${chipBase} ${!activeProperty ? chipActive : chipInactive}`}
            >
              Todos
            </button>
            {properties.map((p) => (
              <button
                key={p.id}
                onClick={() => setParam(propertyParam, activeProperty === p.id ? "" : p.id)}
                className={`${chipBase} ${activeProperty === p.id ? chipActive : chipInactive}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sem contato */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-stone-500 w-20">Parado</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setParam(daysParam, "")}
            className={`${chipBase} ${!activeDays ? chipActive : chipInactive}`}
          >
            Qualquer
          </button>
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setParam(daysParam, activeDays === d.value ? "" : d.value)}
              className={`${chipBase} ${activeDays === d.value ? chipActive : chipInactive}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Limpar filtros */}
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
          className="text-[11px] text-stone-500 hover:text-orange-400 underline underline-offset-2"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
