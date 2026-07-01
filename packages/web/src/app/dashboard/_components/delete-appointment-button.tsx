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
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleDelete() {
    if (!reason.trim()) {
      setError("Informe a justificativa.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (res.ok) {
        router.push(redirectUrl)
        router.refresh()
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Não foi possível cancelar.")
        setLoading(false)
      }
    } catch {
      setError("Não foi possível cancelar.")
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs text-red-500 dark:text-red-400">Confirmar cancelamento?</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Justificativa (obrigatória) — motivo do cancelamento"
          rows={2}
          className="w-64 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        {error && <span className="text-xs text-red-500 dark:text-red-400">{error}</span>}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={loading || !reason.trim()}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Cancelando..." : "Sim, cancelar"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            className="rounded-md px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            Voltar
          </button>
        </div>
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
