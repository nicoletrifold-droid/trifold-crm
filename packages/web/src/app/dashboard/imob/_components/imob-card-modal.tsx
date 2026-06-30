"use client"

import { useEffect, useState } from "react"
import { X, Trash2, Send } from "lucide-react"
import type { BoardCard } from "./imob-board"

interface Comment { id: string; body: string; created_at: string; author: string }

export function ImobCardModal({ card, onClose, onUpdated, onDeleted }: {
  card: BoardCard
  onClose: () => void
  onUpdated: (c: BoardCard) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? "")
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/imob/cards/${card.id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [card.id])

  async function saveField(patch: Partial<BoardCard>) {
    await fetch(`/api/imob/cards/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {})
    onUpdated({ id: card.id, title: patch.title ?? title, description: patch.description ?? (description || null) })
  }

  async function addComment() {
    const body = newComment.trim(); if (!body) return
    setNewComment("")
    const res = await fetch(`/api/imob/cards/${card.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) })
    if (res.ok) {
      const { comment } = await res.json()
      setComments((c) => [...c, comment])
    }
  }

  async function del() {
    if (!confirm("Excluir este cartão?")) return
    await fetch(`/api/imob/cards/${card.id}`, { method: "DELETE" }).catch(() => {})
    onDeleted(card.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== card.title) void saveField({ title: title.trim() }) }}
            className="w-full rounded-lg bg-transparent text-lg font-semibold text-gray-900 focus:bg-stone-50 focus:outline-none dark:text-white dark:focus:bg-stone-800" />
          <button onClick={onClose} className="shrink-0 text-stone-400 hover:text-stone-600"><X className="h-5 w-5" /></button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-stone-500">Descrição</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => { if (description !== (card.description ?? "")) void saveField({ description }) }}
          rows={3} placeholder="Adicione mais detalhes…"
          className="mt-1 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white" />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-stone-500">Discussão</label>
        <div className="mt-1 max-h-56 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-stone-400">Carregando…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-stone-400">Nenhum comentário ainda.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-stone-50 p-2.5 dark:bg-stone-800/60">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span className="font-semibold text-stone-700 dark:text-stone-300">{c.author}</span>
                  <span>{new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-stone-200">{c.body}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-2 flex items-end gap-2">
          <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={1} placeholder="Escreva um comentário…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment() } }}
            className="flex-1 resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white" />
          <button onClick={() => void addComment()} className="rounded-lg bg-[#E8856A] p-2 text-white hover:bg-[#d6724f]"><Send className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 border-t border-stone-200 pt-3 dark:border-stone-800">
          <button onClick={() => void del()} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600"><Trash2 className="h-4 w-4" /> Excluir cartão</button>
        </div>
      </div>
    </div>
  )
}
