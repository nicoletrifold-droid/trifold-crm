"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

export function DeleteAppointmentButton({
  appointmentId,
  redirectUrl,
}: {
  appointmentId: string
  redirectUrl: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        router.push(redirectUrl)
        router.refresh()
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-500 dark:text-red-400">Confirmar exclusão?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Excluindo..." : "Sim, excluir"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Excluir
    </button>
  )
}
