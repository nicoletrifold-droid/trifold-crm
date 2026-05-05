"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"

interface FotoDeleteButtonProps {
  obraId: string
  fotoId: string
}

export function FotoDeleteButton({ obraId, fotoId }: FotoDeleteButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (deleting) return
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita."
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/fotos/${fotoId}`, {
        method: "DELETE",
      })
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        window.alert(data.error ?? "Erro ao excluir a foto.")
        setDeleting(false)
        return
      }
      router.refresh()
    } catch {
      window.alert("Erro de rede.")
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-red-600 disabled:opacity-50"
      aria-label="Excluir foto"
    >
      {deleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
