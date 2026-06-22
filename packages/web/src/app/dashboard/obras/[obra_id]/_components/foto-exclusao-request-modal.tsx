"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

interface Props {
  obraId: string
  fotoId: string
  onClose: () => void
}

// Story 75-14 — perfil "obras" pede exclusão de foto descrevendo o motivo;
// vai para a fila de aprovação do supervisor.
export function FotoExclusaoRequestModal({ obraId, fotoId, onClose }: Props) {
  const router = useRouter()
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo.trim()) {
      setError("Descreva o motivo da exclusão.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/fotos/${fotoId}/solicitar-exclusao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo.trim() }),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao enviar pedido")
      }
      setDone(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar pedido")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 dark:bg-black/70"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-stone-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
            Solicitar exclusão da foto
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="space-y-3 p-5">
            <p className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300">
              Pedido enviado! Aguardando aprovação do supervisor.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 p-5">
            <p className="text-xs text-gray-500 dark:text-stone-400">
              A foto só será removida após o supervisor aprovar o pedido.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
                Motivo da exclusão *
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ex.: foto duplicada / fora de foco / fase errada…"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !motivo.trim()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Enviando…" : "Enviar pedido"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
