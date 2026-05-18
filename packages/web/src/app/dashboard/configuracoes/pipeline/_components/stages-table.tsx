"use client"

import { useState } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { EditStageModal } from "./edit-stage-modal"
import type { Stage } from "./types"

const typeLabels: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  agendado: "Agendado",
  no_show: "No Show",
  visitou: "Visitou",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
}

const GripIcon = () => (
  <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="4" r="1.5" />
    <circle cx="9" cy="4" r="1.5" />
    <circle cx="3" cy="10" r="1.5" />
    <circle cx="9" cy="10" r="1.5" />
    <circle cx="3" cy="16" r="1.5" />
    <circle cx="9" cy="16" r="1.5" />
  </svg>
)

function SortableRow({
  stage,
  isAdmin,
  onUpdate,
  onDelete,
}: {
  stage: Stage
  isAdmin: boolean
  onUpdate: (updated: Stage) => void
  onDelete: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/stages/${stage.id}`, { method: "DELETE" })
    if (res.ok) {
      onDelete(stage.id)
    }
    setDeleting(false)
    setConfirming(false)
  }

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : "hover:bg-gray-50 dark:hover:bg-stone-800/30"}
    >
      <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <span
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              className="inline-flex cursor-grab touch-none select-none items-center text-gray-300 hover:text-gray-500 active:cursor-grabbing dark:text-stone-600 dark:hover:text-stone-400"
              title="Arrastar para reordenar"
            >
              <GripIcon />
            </span>
          )}
          {stage.position}
        </div>
      </td>
      <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
        {stage.name}
      </td>
      <td className="px-6 py-4">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-stone-700/50 dark:text-stone-200">
          {typeLabels[stage.type] ?? stage.type}
        </span>
      </td>
      <td className="px-6 py-4">
        {stage.color ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded-full border border-gray-200 dark:border-stone-700"
              style={{ backgroundColor: stage.color }}
            />
            <span className="text-xs text-gray-500 dark:text-stone-400">{stage.color}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
        {stage.is_default ? "Sim" : "-"}
      </td>
      {isAdmin && (
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <EditStageModal stage={stage} onUpdate={onUpdate} />
            {confirming ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-stone-400">Confirmar?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "..." : "Sim"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                Excluir
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

function DragOverlayRow({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-orange-200 bg-white px-6 py-4 shadow-lg dark:border-orange-800/50 dark:bg-stone-900">
      <span className="text-orange-400">
        <GripIcon />
      </span>
      <span className="font-medium text-gray-900 dark:text-stone-100">{stage.name}</span>
      {stage.color && (
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
      )}
      <span className="ml-auto text-xs text-gray-400 dark:text-stone-500">
        {typeLabels[stage.type] ?? stage.type}
      </span>
    </div>
  )
}

export function StagesTable({
  initialStages,
  isAdmin,
}: {
  initialStages: Stage[]
  isAdmin: boolean
}) {
  const [stages, setStages] = useState(initialStages)
  const [activeStage, setActiveStage] = useState<Stage | null>(null)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveStage(stages.find((s) => s.id === event.active.id) ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveStage(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }))

    const original = stages
    setStages(reordered)

    setSaving(true)
    const changed = reordered.filter((s) => original.find((o) => o.id === s.id)?.position !== s.position)
    await Promise.all(
      changed.map((s) =>
        fetch(`/api/stages/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: s.position }),
        }),
      ),
    )
    setSaving(false)
  }

  function handleStageUpdate(updated: Stage) {
    setStages((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
  }

  function handleStageDelete(id: string) {
    setStages((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      {saving && (
        <div className="border-b border-orange-100 px-6 py-2 text-xs text-orange-600 dark:border-orange-900/30 dark:text-orange-400">
          Salvando ordem...
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Posição</th>
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Cor</th>
              <th className="px-6 py-3">Padrão</th>
              {isAdmin && <th className="px-6 py-3"></th>}
            </tr>
          </thead>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {stages.map((stage) => (
                <SortableRow
                  key={stage.id}
                  stage={stage}
                  isAdmin={isAdmin}
                  onUpdate={handleStageUpdate}
                  onDelete={handleStageDelete}
                />
              ))}
              {stages.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                  >
                    Nenhuma etapa configurada.
                  </td>
                </tr>
              )}
            </tbody>
          </SortableContext>
        </table>
        <DragOverlay>{activeStage && <DragOverlayRow stage={activeStage} />}</DragOverlay>
      </DndContext>
    </div>
  )
}
