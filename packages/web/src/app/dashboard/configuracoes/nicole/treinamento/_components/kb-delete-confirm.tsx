"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface Props { entryId: string; entryTitle: string; base: string }

export function KbDeleteConfirm({ entryId, entryTitle, base }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/knowledge-base/${entryId}`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) {
      router.push(base)
      router.refresh()
    } else {
      const json = await res.json().catch(() => ({}))
      setError((json as { error?: string }).error ?? "Erro ao excluir")
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/10">
      <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-300">Confirmar exclusão</h2>
      <p className="mb-4 text-sm text-red-600 dark:text-red-400">
        Tem certeza que deseja excluir <strong>{entryTitle}</strong>? Esta ação não pode ser desfeita.
      </p>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleDelete} disabled={deleting}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {deleting ? "Excluindo…" : "Confirmar exclusão"}
        </button>
        <Link href={base} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
          Cancelar
        </Link>
      </div>
    </div>
  )
}
