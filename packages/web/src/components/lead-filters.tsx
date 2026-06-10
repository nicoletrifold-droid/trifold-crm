"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"

interface Stage { id: string; name: string; color: string | null }
interface Property { id: string; name: string }
interface Broker { id: string; name: string }

interface LeadFiltersProps {
  stages: Stage[]
  properties: Property[]
  brokers?: Broker[]
  stageParam?: string
  propertyParam?: string
  daysParam?: string
  brokerParam?: string
}

export function LeadFilters({
  stages,
  properties,
  brokers,
  stageParam = "stage",
  propertyParam = "property",
  daysParam = "days",
  brokerParam = "broker_id",
}: LeadFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStage = searchParams.get(stageParam) ?? ""
  const activeProperty = searchParams.get(propertyParam) ?? ""
  const activeDays = searchParams.get(daysParam) ?? ""
  const activeBroker = searchParams.get(brokerParam) ?? ""

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
    "h-8 rounded-lg border border-gray-300 bg-white px-2.5 py-0 text-xs text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:focus:border-orange-500 dark:focus:ring-orange-500"

  const hasFilters = activeStage || activeProperty || activeDays || activeBroker

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Etapa */}
      <select value={activeStage} onChange={(e) => setParam(stageParam, e.target.value)} className={selectClass}>
        <option value="">Etapa: Todas</option>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {/* Empreendimento */}
      {properties.length > 0 && (
        <select value={activeProperty} onChange={(e) => setParam(propertyParam, e.target.value)} className={selectClass}>
          <option value="">Empreendimento: Todos</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      {/* Corretor — só aparece quando passado via prop (admin/supervisor/gerente-comercial) */}
      {brokers && brokers.length > 0 && (
        <select value={activeBroker} onChange={(e) => setParam(brokerParam, e.target.value)} className={selectClass}>
          <option value="">Corretor: Todos</option>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}

      {/* Sem contato */}
      <select value={activeDays} onChange={(e) => setParam(daysParam, e.target.value)} className={selectClass}>
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
            params.delete(brokerParam)
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
