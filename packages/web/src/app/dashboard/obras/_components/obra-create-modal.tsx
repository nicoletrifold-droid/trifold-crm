"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"

export function ObraCreateModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName("")
    setDescription("")
    setExpectedDeliveryDate("")
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!name.trim()) {
      setError("Informe um nome para a obra.")
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/obras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          expected_delivery_date: expectedDeliveryDate || undefined,
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Erro ao criar obra.")
        setLoading(false)
        return
      }

      reset()
      setOpen(false)
      router.refresh()
    } catch {
      setError("Erro de rede.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        <Plus className="h-4 w-4" />
        Nova Obra
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-base font-semibold text-gray-900">
                Nova Obra
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (loading) return
                  reset()
                  setOpen(false)
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div>
                <label
                  htmlFor="obra-name"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  id="obra-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={255}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Ex: Edifício Vista Verde"
                />
              </div>

              <div>
                <label
                  htmlFor="obra-description"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Descrição
                </label>
                <textarea
                  id="obra-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Detalhes da obra (opcional)"
                />
              </div>

              <div>
                <label
                  htmlFor="obra-delivery"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Data prevista de entrega
                </label>
                <input
                  id="obra-delivery"
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (loading) return
                    reset()
                    setOpen(false)
                  }}
                  disabled={loading}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {loading ? "Criando..." : "Criar Obra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
