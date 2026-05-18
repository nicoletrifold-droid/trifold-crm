"use client"

import { useState } from "react"
import { EditStageModal } from "./edit-stage-modal"

interface Stage {
  id: string
  name: string
  slug: string
  type: string
  position: number
  color: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
}

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

export function StagesTable({
  initialStages,
  isAdmin,
}: {
  initialStages: Stage[]
  isAdmin: boolean
}) {
  const [stages, setStages] = useState(initialStages)
  const [movingId, setMovingId] = useState<string | null>(null)

  async function swap(indexA: number, indexB: number) {
    const stageA = stages[indexA]
    const stageB = stages[indexB]
    if (!stageA || !stageB) return

    setMovingId(stageA.id)

    const newStages = [...stages]
    newStages[indexA] = { ...stageA, position: stageB.position }
    newStages[indexB] = { ...stageB, position: stageA.position }
    newStages.sort((a, b) => a.position - b.position)
    setStages(newStages)

    await Promise.all([
      fetch(`/api/stages/${stageA.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: stageB.position }),
      }),
      fetch(`/api/stages/${stageB.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: stageA.position }),
      }),
    ])

    setMovingId(null)
  }

  function handleStageUpdate(updated: Stage) {
    setStages((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
  }

  return (
    <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
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
        <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
          {stages.map((stage, index) => (
            <tr
              key={stage.id}
              className={`hover:bg-gray-50 dark:hover:bg-stone-800/30 ${movingId === stage.id ? "opacity-50" : ""}`}
            >
              <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                {stage.position}
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
                    <span className="text-xs text-gray-500 dark:text-stone-400">
                      {stage.color}
                    </span>
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
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => swap(index, index - 1)}
                      disabled={index === 0 || !!movingId}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-stone-700 dark:hover:text-stone-300"
                      title="Mover para cima"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => swap(index, index + 1)}
                      disabled={index === stages.length - 1 || !!movingId}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-stone-700 dark:hover:text-stone-300"
                      title="Mover para baixo"
                    >
                      ↓
                    </button>
                    <EditStageModal stage={stage} onUpdate={handleStageUpdate} />
                  </div>
                </td>
              )}
            </tr>
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
      </table>
    </div>
  )
}
