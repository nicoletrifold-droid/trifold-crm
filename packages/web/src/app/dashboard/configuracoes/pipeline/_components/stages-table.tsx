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
  type DraggableAttributes,
} from "@dnd-kit/core"
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
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

function DragHandle({
  handleRef,
  listeners,
  attributes,
}: {
  handleRef: (el: HTMLElement | null) => void
  listeners: SyntheticListenerMap | undefined
  attributes: DraggableAttributes
}) {
  return (
    <span
      ref={handleRef}
      {...listeners}
      {...attributes}
      className="inline-flex cursor-grab select-none touch-none items-center text-gray-300 hover:text-gray-500 dark:text-stone-600 dark:hover:text-stone-400 active:cursor-grabbing"
      title="Arrastar para reordenar"
    >
      <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
        <circle cx="3" cy="4" r="1.5" />
        <circle cx="9" cy="4" r="1.5" />
        <circle cx="3" cy="10" r="1.5" />
        <circle cx="9" cy="10" r="1.5" />
        <circle cx="3" cy="16" r="1.5" />
        <circle cx="9" cy="16" r="1.5" />
      </svg>
    </span>
  )
}

function SortableRow({
  stage,
  isAdmin,
  onUpdate,
}: {
  stage: Stage
  isAdmin: boolean
  onUpdate: (updated: Stage) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`${isDragging ? "opacity-40" : "hover:bg-gray-50 dark:hover:bg-stone-800/30"}`}
    >
      <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <DragHandle
              handleRef={setActivatorNodeRef}
              listeners={listeners}
              attributes={attributes}
            />
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
          <EditStageModal stage={stage} onUpdate={onUpdate} />
        </td>
      )}
    </tr>
  )
}

function DragOverlayRow({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-orange-200 bg-white px-6 py-4 shadow-lg dark:border-orange-800/50 dark:bg-stone-900">
      <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" className="text-orange-400">
        <circle cx="3" cy="4" r="1.5" />
        <circle cx="9" cy="4" r="1.5" />
        <circle cx="3" cy="10" r="1.5" />
        <circle cx="9" cy="10" r="1.5" />
        <circle cx="3" cy="16" r="1.5" />
        <circle cx="9" cy="16" r="1.5" />
      </svg>
      <span className="font-medium text-gray-900 dark:text-stone-100">{stage.name}</span>
      {stage.color && (
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: stage.color }}
        />
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
    const found = stages.find((s) => s.id === event.active.id)
    setActiveStage(found ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveStage(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({
      ...s,
      position: i,
    }))
    setStages(reordered)

    setSaving(true)
    const original = stages
    const changed = reordered.filter((s) => {
      const orig = original.find((o) => o.id === s.id)
      return orig?.position !== s.position
    })
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
        <DragOverlay>
          {activeStage && <DragOverlayRow stage={activeStage} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
