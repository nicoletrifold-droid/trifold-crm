"use client"

import { useState } from "react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Plus, Trash2, X, GripVertical } from "lucide-react"
import { ImobCardModal } from "./imob-card-modal"

export interface BoardCard { id: string; title: string; description: string | null }
export interface BoardColumn { id: string; title: string; cards: BoardCard[] }

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  return res.ok ? res.json().catch(() => ({})) : Promise.reject(await res.json().catch(() => ({})))
}

export function ImobBoard({ initialColumns }: { initialColumns: BoardColumn[] }) {
  const [columns, setColumns] = useState<BoardColumn[]>(initialColumns)
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null)
  const [openCard, setOpenCard] = useState<BoardCard | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [newList, setNewList] = useState("")

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const colOf = (cardId: string) => columns.find((c) => c.cards.some((k) => k.id === cardId))

  function persist(next: BoardColumn[]) {
    const payload = Object.fromEntries(next.map((c) => [c.id, c.cards.map((k) => k.id)]))
    void api("/api/imob/cards/reorder", "POST", { columns: payload }).catch(() => {})
  }

  function onDragStart(e: DragStartEvent) {
    const c = colOf(String(e.active.id))
    setActiveCard(c?.cards.find((k) => k.id === e.active.id) ?? null)
  }

  function onDragOver(e: DragOverEvent) {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId || activeId === overId) return
    const from = colOf(activeId)
    // over pode ser um card ou a própria coluna (id da coluna).
    const to = colOf(overId) ?? columns.find((c) => c.id === overId)
    if (!from || !to || from.id === to.id) return
    setColumns((cols) => {
      const card = from.cards.find((k) => k.id === activeId)!
      return cols.map((c) => {
        if (c.id === from.id) return { ...c, cards: c.cards.filter((k) => k.id !== activeId) }
        if (c.id === to.id) {
          const overIdx = c.cards.findIndex((k) => k.id === overId)
          const idx = overIdx >= 0 ? overIdx : c.cards.length
          const copy = c.cards.slice()
          copy.splice(idx, 0, card)
          return { ...c, cards: copy }
        }
        return c
      })
    })
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null)
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (overId && activeId !== overId) {
      const col = colOf(activeId)
      const overCol = colOf(overId)
      if (col && overCol && col.id === overCol.id) {
        const oldIdx = col.cards.findIndex((k) => k.id === activeId)
        const newIdx = col.cards.findIndex((k) => k.id === overId)
        if (oldIdx !== newIdx && newIdx >= 0) {
          setColumns((cols) => cols.map((c) => (c.id === col.id ? { ...c, cards: arrayMove(c.cards, oldIdx, newIdx) } : c)))
        }
      }
    }
    // Persiste o layout final (estado já atualizado pelo onDragOver/arrayMove).
    setColumns((cols) => { persist(cols); return cols })
  }

  // ── Ações de coluna/card ──
  async function addList() {
    const title = newList.trim(); if (!title) return
    setNewList(""); setAddingList(false)
    const { column } = await api("/api/imob/columns", "POST", { title }).catch(() => ({ column: null }))
    if (column) setColumns((c) => [...c, { id: column.id, title: column.title, cards: [] }])
  }
  async function renameList(id: string, title: string) {
    setColumns((c) => c.map((x) => (x.id === id ? { ...x, title } : x)))
    await api(`/api/imob/columns/${id}`, "PATCH", { title }).catch(() => {})
  }
  async function deleteList(id: string) {
    if (!confirm("Excluir esta lista e todos os cards dela?")) return
    setColumns((c) => c.filter((x) => x.id !== id))
    await api(`/api/imob/columns/${id}`, "DELETE").catch(() => {})
  }
  async function addCard(columnId: string, title: string) {
    const t = title.trim(); if (!t) return
    const { card } = await api("/api/imob/cards", "POST", { column_id: columnId, title: t }).catch(() => ({ card: null }))
    if (card) setColumns((c) => c.map((x) => (x.id === columnId ? { ...x, cards: [...x.cards, { id: card.id, title: card.title, description: card.description }] } : x)))
  }
  function onCardUpdated(updated: BoardCard) {
    setColumns((c) => c.map((x) => ({ ...x, cards: x.cards.map((k) => (k.id === updated.id ? updated : k)) })))
  }
  function onCardDeleted(id: string) {
    setColumns((c) => c.map((x) => ({ ...x, cards: x.cards.filter((k) => k.id !== id) })))
    setOpenCard(null)
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-3">
          {columns.map((col) => (
            <Column key={col.id} col={col} onRename={renameList} onDelete={deleteList} onAddCard={addCard} onOpenCard={setOpenCard} />
          ))}
          {/* + Adicionar lista */}
          <div className="w-72 shrink-0">
            {addingList ? (
              <div className="rounded-xl bg-stone-100 p-2 dark:bg-stone-800/60">
                <textarea autoFocus value={newList} onChange={(e) => setNewList(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addList() } }}
                  placeholder="Título da lista…" rows={2}
                  className="w-full resize-none rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-white" />
                <div className="mt-1 flex gap-2">
                  <button onClick={() => void addList()} className="rounded-md bg-[#E8856A] px-3 py-1 text-sm font-semibold text-white">Adicionar</button>
                  <button onClick={() => { setAddingList(false); setNewList("") }} className="text-stone-400 hover:text-stone-600"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingList(true)} className="flex w-full items-center gap-2 rounded-xl bg-stone-100/70 px-3 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:bg-stone-800/40 dark:text-stone-300 dark:hover:bg-stone-800">
                <Plus className="h-4 w-4" /> Adicionar lista
              </button>
            )}
          </div>
        </div>
        <DragOverlay>
          {activeCard ? <div className="rounded-lg bg-white p-2.5 text-sm shadow-lg ring-1 ring-stone-300 dark:bg-stone-800 dark:text-white dark:ring-stone-600">{activeCard.title}</div> : null}
        </DragOverlay>
      </DndContext>

      {openCard && (
        <ImobCardModal card={openCard} onClose={() => setOpenCard(null)} onUpdated={onCardUpdated} onDeleted={onCardDeleted} />
      )}
    </>
  )
}

function Column({ col, onRename, onDelete, onAddCard, onOpenCard }: {
  col: BoardColumn
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onAddCard: (columnId: string, title: string) => void
  onOpenCard: (card: BoardCard) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.id })
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(col.title)
  const [adding, setAdding] = useState(false)
  const [newCard, setNewCard] = useState("")

  return (
    <div ref={setNodeRef} className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-stone-100 p-2 dark:bg-stone-800/60">
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        {editing ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { setEditing(false); if (title.trim() && title !== col.title) onRename(col.id, title.trim()) }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
            className="w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 text-sm font-semibold dark:border-stone-600 dark:bg-stone-900 dark:text-white" />
        ) : (
          <button onClick={() => setEditing(true)} className="truncate text-sm font-semibold text-stone-700 dark:text-stone-200">
            {col.title} <span className="ml-1 text-xs font-normal text-stone-400">{col.cards.length}</span>
          </button>
        )}
        <button onClick={() => onDelete(col.id)} aria-label="Excluir lista" className="shrink-0 text-stone-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      <SortableContext items={col.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-0.5">
          {col.cards.map((card) => <SortableCard key={card.id} card={card} onClick={() => onOpenCard(card)} />)}
        </div>
      </SortableContext>

      {adding ? (
        <div className="mt-2">
          <textarea autoFocus value={newCard} onChange={(e) => setNewCard(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAddCard(col.id, newCard); setNewCard(""); setAdding(false) } }}
            placeholder="Título do cartão…" rows={2}
            className="w-full resize-none rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-white" />
          <div className="mt-1 flex gap-2">
            <button onClick={() => { onAddCard(col.id, newCard); setNewCard(""); setAdding(false) }} className="rounded-md bg-[#E8856A] px-3 py-1 text-sm font-semibold text-white">Adicionar</button>
            <button onClick={() => { setAdding(false); setNewCard("") }} className="text-stone-400 hover:text-stone-600"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-700/50">
          <Plus className="h-4 w-4" /> Adicionar cartão
        </button>
      )}
    </div>
  )
}

function SortableCard({ card, onClick }: { card: BoardCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded-lg bg-white p-2.5 text-sm shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700 ${isDragging ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-1.5">
        <button {...attributes} {...listeners} aria-label="Arrastar" className="mt-0.5 cursor-grab text-stone-300 opacity-0 group-hover:opacity-100 dark:text-stone-600">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button onClick={onClick} className="min-w-0 flex-1 text-left">
          <p className="whitespace-pre-wrap break-words">{card.title}</p>
          {card.description ? <p className="mt-1 truncate text-xs text-stone-400">{card.description}</p> : null}
        </button>
      </div>
    </div>
  )
}
