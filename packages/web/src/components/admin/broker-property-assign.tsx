"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function BrokerPropertyAssign({
  brokerId,
  properties,
  currentAssignments,
}: {
  brokerId: string
  properties: Array<{ id: string; name: string }>
  currentAssignments: string[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(propertyId: string, assigned: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/brokers/${brokerId}/assignments`, {
        method: assigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: propertyId }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(
          res.status === 403
            ? "Sem permissão para alterar empreendimentos"
            : (detail?.error ?? `Falha ao salvar (HTTP ${res.status})`)
        )
      }
      router.refresh()
    } catch (err) {
      console.error("[broker-assign] Falha ao alterar empreendimento:", err)
      setError(err instanceof Error ? err.message : "Falha ao salvar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {properties.map((p) => {
          const assigned = currentAssignments.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id, assigned)}
              disabled={loading}
              aria-pressed={assigned}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                assigned
                  ? "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/20"
                  : "bg-stone-100 text-stone-400 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-500 dark:hover:bg-stone-700"
              }`}
            >
              {p.name}
            </button>
          )
        })}
      </div>
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
