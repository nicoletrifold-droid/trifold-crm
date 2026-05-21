"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

interface Fase {
  id: string
  name: string
  description: string | null
  status: string
  progress_pct: number
  start_date: string | null
  end_date: string | null
  expected_start_date: string | null
  expected_end_date: string | null
}

interface FaseEditModalProps {
  obraId: string
  fase: Fase
  onClose: () => void
}

const STATUS_OPTIONS = [
  { value: "a_iniciar", label: "A iniciar" },
  { value: "em_andamento", label: "Em execução" },
  { value: "pausada", label: "Pausada" },
  { value: "concluida", label: "Concluída" },
]

export function FaseEditModal({ obraId, fase, onClose }: FaseEditModalProps) {
  const router = useRouter()
  const [name, setName] = useState(fase.name)
  const [description, setDescription] = useState(fase.description ?? "")
  const [status, setStatus] = useState(fase.status)
  const [startDate, setStartDate] = useState(fase.start_date ?? "")
  const [endDate, setEndDate] = useState(fase.end_date ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/fases/${fase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          status,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao salvar")
      }
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar fase")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/70">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-stone-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">Editar Fase</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto p-5" style={{ maxHeight: "80vh" }}>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
              Nome *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
              Etapa
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
                Data de início
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
                Data de término
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

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
              disabled={saving || !name.trim()}
              className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
