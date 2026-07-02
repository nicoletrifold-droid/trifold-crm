"use client"

import { useEffect, useState } from "react"
import { X, Trash2, Send } from "lucide-react"
import { LABEL_COLORS, COR_HEX } from "@web/lib/lancamentos/lancamentos"
import type { BoardCard, Member } from "./lancamento-board"

interface Comment { id: string; body: string; created_at: string; author: string }

export function LancamentoCardModal({ card, members, onClose, onUpdated, onDeleted }: {
  card: BoardCard
  members: Member[]
  onClose: () => void
  onUpdated: (c: BoardCard) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? "")
  const [labels, setLabels] = useState<string[]>(card.labels)
  const [dueDate, setDueDate] = useState<string>(card.due_date ? card.due_date.slice(0, 10) : "")
  const [assigneeId, setAssigneeId] = useState<string>(card.assignee_id ?? "")
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/lancamentos/cards/${card.id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [card.id])

  const iso = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : null)
  const nameOf = (id: string) => (id ? members.find((m) => m.id === id)?.name ?? null : null)

  // Salva o campo alterado (PATCH) e propaga o cartão atualizado para o board.
  function emit(next: { title?: string; description?: string; due?: string; assignee?: string; labels?: string[] }) {
    const t = (next.title ?? title).trim() || card.title
    const desc = next.description !== undefined ? next.description : description
    const d = next.due !== undefined ? next.due : dueDate
    const a = next.assignee !== undefined ? next.assignee : assigneeId
    const ls = next.labels ?? labels

    const body: Record<string, unknown> = {}
    if (next.title !== undefined) body.title = t
    if (next.description !== undefined) body.description = desc
    if (next.due !== undefined) body.due_date = iso(d)
    if (next.assignee !== undefined) body.assignee_id = a || null
    if (next.labels !== undefined) body.labels = ls
    void fetch(`/api/lancamentos/cards/${card.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => {})

    onUpdated({
      id: card.id, title: t, description: desc || null,
      due_date: iso(d), assignee_id: a || null, assignee_name: nameOf(a || ""), labels: ls,
    })
  }

  function toggleLabel(c: string) {
    const ls = labels.includes(c) ? labels.filter((x) => x !== c) : [...labels, c]
    setLabels(ls)
    emit({ labels: ls })
  }

  async function addComment() {
    const body = newComment.trim(); if (!body) return
    setNewComment("")
    const res = await fetch(`/api/lancamentos/cards/${card.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) })
    if (res.ok) {
      const { comment } = await res.json()
      setComments((c) => [...c, comment])
    }
  }

  async function del() {
    if (!confirm("Excluir este cartão?")) return
    await fetch(`/api/lancamentos/cards/${card.id}`, { method: "DELETE" }).catch(() => {})
    onDeleted(card.id)
  }

  const fieldCls = "mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
  const lblCls = "block text-xs font-semibold uppercase tracking-wide text-stone-500"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== card.title) emit({ title }) }}
            className="w-full rounded-lg bg-transparent text-lg font-semibold text-gray-900 focus:bg-stone-50 focus:outline-none dark:text-white dark:focus:bg-stone-800" />
          <button onClick={onClose} className="shrink-0 text-stone-400 hover:text-stone-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Coluna principal */}
          <div className="md:col-span-2">
            <label className={lblCls}>Etiquetas</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {LABEL_COLORS.map((c) => {
                const active = labels.includes(c)
                return (
                  <button key={c} type="button" onClick={() => toggleLabel(c)} aria-label={`Etiqueta ${c}`}
                    className={`h-6 w-10 rounded-md transition-transform ${active ? "ring-2 ring-offset-1 ring-stone-400 dark:ring-offset-stone-900" : "opacity-60 hover:opacity-100"}`}
                    style={{ background: COR_HEX[c] }} />
                )
              })}
            </div>

            <label className={`${lblCls} mt-4`}>Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => { if (description !== (card.description ?? "")) emit({ description }) }}
              rows={3} placeholder="Adicione mais detalhes…" className={`${fieldCls} resize-none`} />

            <label className={`${lblCls} mt-4`}>Discussão</label>
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
                className={`${fieldCls} flex-1 resize-none`} />
              <button onClick={() => void addComment()} className="rounded-lg bg-[#E8856A] p-2 text-white hover:bg-[#d6724f]"><Send className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Sidebar: responsável, prazo */}
          <div className="space-y-4">
            <div>
              <label className={lblCls}>Responsável</label>
              <select className={fieldCls} value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); emit({ assignee: e.target.value }) }}>
                <option value="">— Ninguém —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lblCls}>Prazo</label>
              <input type="date" className={fieldCls} value={dueDate} onChange={(e) => { setDueDate(e.target.value); emit({ due: e.target.value }) }} />
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-200 pt-3 dark:border-stone-800">
          <button onClick={() => void del()} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600"><Trash2 className="h-4 w-4" /> Excluir cartão</button>
        </div>
      </div>
    </div>
  )
}
