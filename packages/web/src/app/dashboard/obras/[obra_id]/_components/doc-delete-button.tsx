"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

interface DocDeleteButtonProps {
  obraId: string
  docId: string
}

export function DocDeleteButton({ obraId, docId }: DocDeleteButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm("Remover este documento?")) return
    setLoading(true)
    try {
      await fetch(`/api/admin/obras/${obraId}/documentos/${docId}`, {
        method: "DELETE",
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      title="Remover documento"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
