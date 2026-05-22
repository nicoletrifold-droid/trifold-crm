"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface ObraReativarButtonProps {
  obraId: string
  obraName: string
}

export function ObraReativarButton({ obraId, obraName }: ObraReativarButtonProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setConfirming(true)
    setError(null)
  }

  function handleCancel() {
    setConfirming(false)
    setError(null)
  }

  async function handleConfirm() {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/obras/${obraId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted_at: null }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Erro ao reativar obra.")
        return
      }

      router.refresh()
    } catch {
      setError("Erro de rede. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
        <button
          onClick={() => { setError(null); setConfirming(false) }}
          className="text-xs text-gray-500 underline dark:text-stone-400"
        >
          Fechar
        </button>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600 dark:text-stone-300">
          Reativar &quot;{obraName}&quot;?
        </span>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="rounded border border-green-500 px-2 py-0.5 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
        >
          {loading ? "..." : "Sim"}
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleClick}
      className="rounded border border-green-400 px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
    >
      Reativar
    </button>
  )
}
