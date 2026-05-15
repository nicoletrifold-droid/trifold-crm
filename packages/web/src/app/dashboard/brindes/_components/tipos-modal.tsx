"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Pencil, Check, Package } from "lucide-react"
import type { BrindeTipo } from "./types"

interface TiposModalProps {
  tipos: BrindeTipo[]
  onClose: () => void
}

const EMPTY_FORM = { nome: "", descricao: "", tamanho: "", cor: "" }

export function TiposModal({ tipos: initialTipos, onClose }: TiposModalProps) {
  const router = useRouter()
  const [tipos, setTipos] = useState(initialTipos)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating || !form.nome.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/brindes/tipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          tamanho: form.tamanho.trim() || null,
          cor: form.cor.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setCreateError(d.error ?? "Erro ao criar.")
        return
      }
      const { data: created } = (await res.json()) as { data: BrindeTipo }
      setTipos((prev) => [...prev, created].sort((a, b) => a.nome.localeCompare(b.nome)))
      setForm(EMPTY_FORM)
      router.refresh()
    } catch {
      setCreateError("Erro de rede.")
    } finally {
      setCreating(false)
    }
  }

  function startEdit(t: BrindeTipo) {
    setEditingId(t.id)
    setEditForm({ nome: t.nome, descricao: t.descricao ?? "", tamanho: t.tamanho ?? "", cor: t.cor ?? "" })
  }

  async function handleSaveEdit(id: string) {
    if (savingId || !editForm.nome.trim()) return
    setSavingId(id)
    try {
      const res = await fetch(`/api/brindes/tipos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editForm.nome.trim(),
          descricao: editForm.descricao.trim() || null,
          tamanho: editForm.tamanho.trim() || null,
          cor: editForm.cor.trim() || null,
        }),
      })
      if (res.ok) {
        const { data: updated } = (await res.json()) as { data: BrindeTipo }
        setTipos((prev) =>
          prev.map((t) => (t.id === id ? updated : t)).sort((a, b) => a.nome.localeCompare(b.nome))
        )
        setEditingId(null)
        router.refresh()
      }
    } finally {
      setSavingId(null)
    }
  }

  async function toggleAtivo(t: BrindeTipo) {
    if (togglingId) return
    setTogglingId(t.id)
    try {
      const res = await fetch(`/api/brindes/tipos/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !t.ativo }),
      })
      if (res.ok) {
        setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, ativo: !x.ativo } : x)))
        router.refresh()
      }
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-700">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-stone-700">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Tipos de Brinde</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-2">
          {tipos.length === 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-stone-500 py-4">Nenhum tipo cadastrado.</p>
          )}
          {tipos.map((t) => (
            <div key={t.id} className={`rounded-lg border p-3 ${t.ativo ? "border-gray-200 dark:border-stone-700" : "border-gray-100 opacity-60 dark:border-stone-800"}`}>
              {editingId === t.id ? (
                <div className="space-y-2">
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                    placeholder="Nome*"
                    value={editForm.nome}
                    onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <input
                      className="w-1/2 rounded border border-gray-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                      placeholder="Tamanho"
                      value={editForm.tamanho}
                      onChange={(e) => setEditForm((f) => ({ ...f, tamanho: e.target.value }))}
                    />
                    <input
                      className="w-1/2 rounded border border-gray-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                      placeholder="Cor"
                      value={editForm.cor}
                      onChange={(e) => setEditForm((f) => ({ ...f, cor: e.target.value }))}
                    />
                  </div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                    placeholder="Descrição"
                    value={editForm.descricao}
                    onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))}
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 dark:text-stone-400">Cancelar</button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(t.id)}
                      disabled={!!savingId}
                      className="inline-flex items-center gap-1 rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-stone-100 truncate">{t.nome}</p>
                    <p className="text-xs text-gray-400 dark:text-stone-500">
                      {[t.tamanho, t.cor].filter(Boolean).join(" · ") || "Sem atributos"}
                      {!t.ativo && " · Inativo"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAtivo(t)}
                      disabled={togglingId === t.id}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200 disabled:opacity-50 px-1"
                    >
                      {togglingId === t.id ? "..." : t.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleCreate} className="border-t border-gray-200 px-6 py-4 space-y-2 dark:border-stone-700">
          <p className="text-xs font-medium text-gray-500 dark:text-stone-400 uppercase tracking-wide">Novo tipo</p>
          <input
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
            placeholder="Nome*"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              className="w-1/2 rounded border border-gray-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              placeholder="Tamanho (ex: G)"
              value={form.tamanho}
              onChange={(e) => setForm((f) => ({ ...f, tamanho: e.target.value }))}
            />
            <input
              className="w-1/2 rounded border border-gray-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              placeholder="Cor (ex: Azul)"
              value={form.cor}
              onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
            />
          </div>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
            placeholder="Descrição (opcional)"
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
          />
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !form.nome.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {creating ? "Criando..." : "Adicionar"}
          </button>
        </form>
      </div>
    </div>
  )
}
