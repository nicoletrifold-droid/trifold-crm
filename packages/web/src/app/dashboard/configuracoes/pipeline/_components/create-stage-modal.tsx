"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const STAGE_TYPES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "agendado", label: "Agendado" },
  { value: "no_show", label: "No Show" },
  { value: "visitou", label: "Visitou" },
  { value: "proposta", label: "Proposta" },
  { value: "fechado", label: "Fechado" },
  { value: "perdido", label: "Perdido" },
]

export function CreateStageModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState("novo")
  const [color, setColor] = useState("#6b7280")
  const [isDefault, setIsDefault] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setName("")
    setType("novo")
    setColor("#6b7280")
    setIsDefault(false)
    setError(null)
    setOpen(true)
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("O nome não pode estar vazio.")
      return
    }
    setLoading(true)
    setError(null)
    const res = await fetch("/api/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        type,
        color,
        is_default: isDefault,
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? "Erro ao criar etapa.")
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        + Nova etapa
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">
                Nova etapa
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                  Nome
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Negociação"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                >
                  {STAGE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                  Cor
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-gray-300 p-0.5 dark:border-stone-700 dark:bg-stone-800"
                  />
                  <span className="text-sm text-gray-500 dark:text-stone-400">{color}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="new_is_default"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-orange-500"
                />
                <label
                  htmlFor="new_is_default"
                  className="text-sm font-medium text-gray-700 dark:text-stone-300"
                >
                  Etapa padrão
                </label>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {loading ? "Criando..." : "Criar etapa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
