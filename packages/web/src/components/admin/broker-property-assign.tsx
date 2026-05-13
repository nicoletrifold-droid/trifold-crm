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

  async function toggle(propertyId: string, assigned: boolean) {
    setLoading(true)
    await fetch(`/api/brokers/${brokerId}/assignments`, {
      method: assigned ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: propertyId }),
    })
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex gap-1">
      {properties.map((p) => {
        const assigned = currentAssignments.includes(p.id)
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id, assigned)}
            disabled={loading}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
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
  )
}
