"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X, Plus } from "lucide-react"
import type { DataComemorativa } from "./types"

interface DatasModalProps {
  datas: DataComemorativa[]
  onClose: () => void
}

export function DatasModal({ datas: initialDatas, onClose }: DatasModalProps) {
  const router = useRouter()
  const [datas, setDatas] = useState(initialDatas)
  const [newNome, setNewNome] = useState("")
  const [newData, setNewData] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating || !newNome.trim() || !newData) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/brindes/datas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newNome.trim(), data: newData }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setCreateError(d.error ?? "Erro ao criar.")
        return
      }
      const { data: created } = (await res.json()) as { data: DataComemorativa }
      setDatas((prev) => [...prev, created].sort((a, b) => a.data.localeCompare(b.data)))
      setNewNome("")
      setNewData("")
      router.refresh()
    } catch {
      setCreateError("Erro de rede.")
    } finally {
      setCreating(false)
    }
  }

  async function toggleAtiva(d: DataComemorativa) {
    if (toggling) return
    setToggling(d.id)
    try {
      const res = await fetch(`/api/brindes/datas/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativa: !d.ativa }),
      })
      if (res.ok) {
        setDatas((prev) => prev.map((x) => x.id === d.id ? { ...x, ativa: !x.ativa } : x))
        router.refresh()
      }
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-stone-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">Datas Comemorativas</h2>
          <button type="button" onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 px-5 py-3 dark:divide-stone-800">
          {datas.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-stone-100">{d.nome}</p>
                <p className="text-xs text-gray-500 dark:text-stone-400">
                  {new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.ativa ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"}`}>
                  {d.ativa ? "Ativa" : "Inativa"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleAtiva(d)}
                  disabled={toggling === d.id}
                  className="text-xs text-orange-600 hover:text-orange-800 disabled:opacity-50 dark:text-orange-300 dark:hover:text-orange-200"
                >
                  {d.ativa ? "Desativar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
          {datas.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-stone-400">Nenhuma data cadastrada.</p>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-4 dark:border-stone-800">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-stone-300">Nova data comemorativa</p>
          <form onSubmit={handleCreate} className="flex items-end gap-2">
            <div className="flex-1">
              <input type="text" value={newNome} onChange={(e) => setNewNome(e.target.value)}
                placeholder="Nome" required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500" />
            </div>
            <div>
              <input type="date" value={newData} onChange={(e) => setNewData(e.target.value)}
                required
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
            </div>
            <button type="submit" disabled={creating}
              className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" />
              {creating ? "..." : "Adicionar"}
            </button>
          </form>
          {createError && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{createError}</p>}
        </div>
      </div>
    </div>
  )
}
