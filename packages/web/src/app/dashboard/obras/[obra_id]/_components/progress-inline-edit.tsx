"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X } from "lucide-react"

interface ProgressInlineEditProps {
  obraId: string
  value: number
}

export function ProgressInlineEdit({ obraId, value }: ProgressInlineEditProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  function openEdit() {
    setDraft(value)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/admin/obras/${obraId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_pct: draft }),
      })
      router.refresh()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-stone-400">Progresso geral</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-stone-100">{value}%</span>
            <button
              onClick={openEdit}
              title="Editar progresso"
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-orange-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-orange-400"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-stone-700">
          <div
            className="h-2 rounded-full bg-orange-500 transition-all"
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-stone-400">Progresso geral</span>
        <div className="flex items-center gap-1">
          <span className="w-10 text-right font-medium text-gray-900 dark:text-stone-100">{draft}%</span>
          <button
            onClick={save}
            disabled={saving}
            title="Salvar"
            className="rounded p-0.5 text-green-500 hover:bg-green-50 disabled:opacity-50 dark:hover:bg-green-500/10"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            title="Cancelar"
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        className="w-full accent-orange-500"
      />
      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-stone-700">
        <div
          className="h-2 rounded-full bg-orange-500 transition-all"
          style={{ width: `${draft}%` }}
        />
      </div>
    </div>
  )
}
