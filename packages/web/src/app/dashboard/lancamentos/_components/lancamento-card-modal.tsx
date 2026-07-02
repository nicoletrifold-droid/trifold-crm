"use client"

import { useEffect, useRef, useState } from "react"
import { X, Trash2, Send, Plus, Paperclip, Download } from "lucide-react"
import { LABEL_COLORS, COR_HEX } from "@web/lib/lancamentos/lancamentos"
import type { BoardCard, Member } from "./lancamento-board"

interface Comment { id: string; body: string; created_at: string; author: string }
interface ChkItem { id: string; text: string; done: boolean; position: number }
interface Attachment { id: string; file_name: string; file_size_bytes: number | null; mime: string | null; created_at: string }

function fmtSize(b: number | null): string {
  if (!b) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

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
  const [checklist, setChecklist] = useState<ChkItem[]>([])
  const [newChk, setNewChk] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/lancamentos/cards/${card.id}/comments`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/lancamentos/cards/${card.id}/checklist`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/lancamentos/cards/${card.id}/attachments`).then((r) => r.json()).catch(() => ({})),
    ]).then(([c, k, a]) => {
      setComments(c.comments ?? [])
      setChecklist(k.items ?? [])
      setAttachments(a.attachments ?? [])
    }).finally(() => setLoading(false))
  }, [card.id])

  const iso = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : null)
  const nameOf = (id: string) => (id ? members.find((m) => m.id === id)?.name ?? null : null)

  // Propaga o cartão atualizado (campos + contadores) para o board.
  function pushCard(chk: ChkItem[] = checklist, att: Attachment[] = attachments) {
    onUpdated({
      id: card.id, title: title.trim() || card.title, description: description || null,
      due_date: iso(dueDate), assignee_id: assigneeId || null, assignee_name: nameOf(assigneeId || ""), labels,
      checklist_total: chk.length, checklist_done: chk.filter((i) => i.done).length, attachment_count: att.length,
    })
  }

  function emit(next: { title?: string; description?: string; due?: string; assignee?: string; labels?: string[] }) {
    const body: Record<string, unknown> = {}
    if (next.title !== undefined) body.title = (next.title || card.title).trim()
    if (next.description !== undefined) body.description = next.description
    if (next.due !== undefined) body.due_date = iso(next.due)
    if (next.assignee !== undefined) body.assignee_id = next.assignee || null
    if (next.labels !== undefined) body.labels = next.labels
    void fetch(`/api/lancamentos/cards/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {})
    pushCard()
  }

  function toggleLabel(c: string) {
    const ls = labels.includes(c) ? labels.filter((x) => x !== c) : [...labels, c]
    setLabels(ls); emit({ labels: ls })
  }

  // ── Checklist ──
  async function addChk() {
    const text = newChk.trim(); if (!text) return
    setNewChk("")
    const res = await fetch(`/api/lancamentos/cards/${card.id}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
    if (res.ok) {
      const { item } = await res.json()
      const next = [...checklist, item]; setChecklist(next); pushCard(next)
    }
  }
  function toggleChk(it: ChkItem) {
    const next = checklist.map((i) => (i.id === it.id ? { ...i, done: !i.done } : i))
    setChecklist(next); pushCard(next)
    void fetch(`/api/lancamentos/cards/${card.id}/checklist/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !it.done }) }).catch(() => {})
  }
  function delChk(it: ChkItem) {
    const next = checklist.filter((i) => i.id !== it.id)
    setChecklist(next); pushCard(next)
    void fetch(`/api/lancamentos/cards/${card.id}/checklist/${it.id}`, { method: "DELETE" }).catch(() => {})
  }

  // ── Anexos ──
  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch(`/api/lancamentos/cards/${card.id}/attachments`, { method: "POST", body: fd })
      if (res.ok) {
        const { attachment } = await res.json()
        const next = [...attachments, attachment]; setAttachments(next); pushCard(checklist, next)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }
  async function download(att: Attachment) {
    const res = await fetch(`/api/lancamentos/cards/${card.id}/attachments/${att.id}/signed-url`)
    if (res.ok) { const { url } = await res.json(); if (url) window.open(url, "_blank") }
  }
  function delAtt(att: Attachment) {
    const next = attachments.filter((a) => a.id !== att.id)
    setAttachments(next); pushCard(checklist, next)
    void fetch(`/api/lancamentos/cards/${card.id}/attachments/${att.id}`, { method: "DELETE" }).catch(() => {})
  }

  async function addComment() {
    const body = newComment.trim(); if (!body) return
    setNewComment("")
    const res = await fetch(`/api/lancamentos/cards/${card.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) })
    if (res.ok) { const { comment } = await res.json(); setComments((c) => [...c, comment]) }
  }

  async function del() {
    if (!confirm("Excluir este cartão?")) return
    await fetch(`/api/lancamentos/cards/${card.id}`, { method: "DELETE" }).catch(() => {})
    onDeleted(card.id)
  }

  const fieldCls = "mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
  const lblCls = "block text-xs font-semibold uppercase tracking-wide text-stone-500"
  const chkDoneCount = checklist.filter((i) => i.done).length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== card.title) emit({ title }) }}
            className="w-full rounded-lg bg-transparent text-lg font-semibold text-gray-900 focus:bg-stone-50 focus:outline-none dark:text-white dark:focus:bg-stone-800" />
          <button onClick={onClose} className="shrink-0 text-stone-400 hover:text-stone-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
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

            {/* Checklist */}
            <div className="mt-4 flex items-center justify-between">
              <label className={lblCls}>Checklist</label>
              {checklist.length > 0 && <span className="text-xs text-stone-500">{chkDoneCount}/{checklist.length}</span>}
            </div>
            {checklist.length > 0 && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((chkDoneCount / checklist.length) * 100)}%` }} />
              </div>
            )}
            <div className="mt-2 space-y-1">
              {checklist.map((it) => (
                <div key={it.id} className="group flex items-center gap-2 text-sm">
                  <button onClick={() => toggleChk(it)} aria-label={it.done ? "Desmarcar" : "Marcar"}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${it.done ? "border-[#E8856A] bg-[#E8856A] text-white" : "border-stone-400 dark:border-stone-500"}`}>
                    {it.done && "✓"}
                  </button>
                  <span className={it.done ? "text-stone-400 line-through" : "text-stone-700 dark:text-stone-200"}>{it.text}</span>
                  <button onClick={() => delChk(it)} className="ml-auto text-stone-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <input value={newChk} onChange={(e) => setNewChk(e.target.value)} placeholder="Adicionar item…"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addChk() } }}
                className={fieldCls} />
              <button onClick={() => void addChk()} className="mt-1 shrink-0 rounded-md border border-stone-300 px-2 text-sm text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"><Plus className="h-4 w-4" /></button>
            </div>

            {/* Anexos */}
            <label className={`${lblCls} mt-4`}>Anexos</label>
            <div className="mt-1.5 space-y-1.5">
              {attachments.map((a) => (
                <div key={a.id} className="group flex items-center gap-2 rounded-lg border border-stone-200 p-2 text-sm dark:border-stone-700">
                  <Paperclip className="h-4 w-4 shrink-0 text-stone-400" />
                  <span className="truncate text-stone-700 dark:text-stone-200">{a.file_name}</span>
                  <span className="ml-auto shrink-0 text-xs text-stone-400">{fmtSize(a.file_size_bytes)}</span>
                  <button onClick={() => void download(a)} className="shrink-0 text-stone-400 hover:text-[#E8856A]" aria-label="Baixar"><Download className="h-4 w-4" /></button>
                  <button onClick={() => delAtt(a)} className="shrink-0 text-stone-300 opacity-0 hover:text-red-500 group-hover:opacity-100" aria-label="Remover"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="mt-1.5 w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-center text-sm text-stone-400 hover:border-[#E8856A] hover:text-[#E8856A] disabled:opacity-60 dark:border-stone-700">
              {uploading ? "Enviando…" : "Clique para anexar arquivo (até 25 MB)"}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />

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

          <div className="space-y-4">
            <div>
              <label className={lblCls}>Responsável</label>
              <select className={fieldCls} value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); emit({ assignee: e.target.value }) }}>
                <option value="">— Ninguém —</option>
                {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
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
