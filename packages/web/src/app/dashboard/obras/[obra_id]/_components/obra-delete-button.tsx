"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Trash2 } from "lucide-react"

interface ObraDeleteButtonProps {
  obraId: string
  obraName: string
}

export function ObraDeleteButton({ obraId, obraName }: ObraDeleteButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfirmed = confirmText === obraName

  function handleOpen() {
    setOpen(true)
    setConfirmText("")
    setError(null)
  }

  function handleClose() {
    if (loading) return
    setOpen(false)
    setConfirmText("")
    setError(null)
  }

  async function handleConfirm() {
    if (!isConfirmed || loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/obras/${obraId}`, { method: "DELETE" })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Erro ao apagar obra.")
        return
      }

      router.push("/dashboard/obras")
    } catch {
      setError("Erro de rede. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        <span className="flex items-center gap-1.5">
          <Trash2 className="h-4 w-4" />
          Apagar Obra
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-stone-900">
            {/* Header */}
            <div className="flex items-start gap-4 border-b border-gray-200 p-6 dark:border-stone-800">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-stone-100">
                  Apagar esta obra?
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
                  Esta ação não pode ser desfeita pelo painel.
                </p>
              </div>
            </div>

            {/* Avisos */}
            <div className="p-6">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">
                  Atenção — consequências imediatas:
                </p>
                <ul className="space-y-2 text-sm text-red-700 dark:text-red-400">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold">•</span>
                    Todos os clientes vinculados perderão o acesso ao portal desta obra
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold">•</span>
                    Fases, fotos, documentos e mensagens ficam inacessíveis
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold">•</span>
                    A obra deixa de aparecer em todos os relatórios e métricas
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold">•</span>
                    Esta ação pode ser revertida apenas por um administrador técnico
                  </li>
                </ul>
              </div>

              {/* Campo de confirmação */}
              <div className="mt-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
                  Para confirmar, digite o nome exato da obra:
                </label>
                <p className="mt-1 select-none rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-800 dark:bg-stone-800 dark:text-stone-200">
                  {obraName}
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Digite o nome da obra..."
                  disabled={loading}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                />
              </div>

              {error && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-stone-800">
              <button
                onClick={handleClose}
                disabled={loading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={!isConfirmed || loading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
              >
                {loading ? "Apagando..." : "Confirmar Exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
