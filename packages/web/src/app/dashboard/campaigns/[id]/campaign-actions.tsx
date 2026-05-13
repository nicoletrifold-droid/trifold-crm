"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function CampaignActions({
  campaignId,
  status,
}: {
  campaignId: string
  status: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleAction(action: "activate" | "pause") {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/${action}`, {
        method: "POST",
      })
      if (res.ok) router.refresh()
      else {
        const data = await res.json()
        alert(data.error ?? "Erro")
      }
    } finally {
      setLoading(false)
    }
  }

  if (status === "active") {
    return (
      <button
        onClick={() => handleAction("pause")}
        disabled={loading}
        className="rounded-md border border-yellow-300 px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50 dark:border-yellow-500/40 dark:text-yellow-300 dark:hover:bg-yellow-500/10"
      >
        {loading ? "..." : "Pausar"}
      </button>
    )
  }

  if (status === "draft" || status === "paused") {
    return (
      <button
        onClick={() => handleAction("activate")}
        disabled={loading}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "..." : "Ativar"}
      </button>
    )
  }

  return null
}
