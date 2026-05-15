"use client"

import { useState, useRef, useEffect } from "react"
import type { BrindeTipo, EntregaStatus } from "./types"
import { STATUS_LABEL, STATUS_BADGE_CLASS } from "./types"

interface StatusBadgeProps {
  status: EntregaStatus
  disabled: boolean
  destinatarioId: string
  dataComemorativaId: string
  currentTipoId: string | null
  tipos: BrindeTipo[]
  onStatusChange: (destinatarioId: string, newStatus: EntregaStatus, tipoId: string | null) => void
}

const ALL_STATUSES: EntregaStatus[] = ["pendente", "entregue", "nao_encontrado"]

export function StatusBadge({
  status,
  disabled,
  destinatarioId,
  dataComemorativaId,
  currentTipoId,
  tipos,
  onStatusChange,
}: StatusBadgeProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedTipoId, setSelectedTipoId] = useState<string>(currentTipoId ?? "")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedTipoId(currentTipoId ?? "")
  }, [currentTipoId])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function selectStatus(newStatus: EntregaStatus) {
    if (loading) return
    setLoading(true)
    setOpen(false)
    const tipoId = selectedTipoId || null
    try {
      const res = await fetch("/api/brindes/entregas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatario_id: destinatarioId,
          data_comemorativa_id: dataComemorativaId,
          status: newStatus,
          brinde_tipo_id: tipoId,
        }),
      })
      if (res.ok) {
        onStatusChange(destinatarioId, newStatus, tipoId)
      }
    } finally {
      setLoading(false)
    }
  }

  if (disabled) {
    return <span className="text-xs text-gray-400 dark:text-stone-500">—</span>
  }

  const tiposAtivos = tipos.filter((t) => t.ativo)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !loading && setOpen((o) => !o)}
        disabled={loading}
        className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${STATUS_BADGE_CLASS[status]} ${loading ? "opacity-50" : "hover:ring-1 hover:ring-offset-1 hover:ring-gray-400 dark:hover:ring-stone-500 dark:hover:ring-offset-stone-900"}`}
      >
        {loading ? "..." : STATUS_LABEL[status]}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-gray-200 bg-white shadow-lg dark:border-stone-800 dark:bg-stone-900">
          {tiposAtivos.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-stone-800">
              <label className="block text-xs text-gray-400 dark:text-stone-500 mb-1">Tipo de brinde</label>
              <select
                value={selectedTipoId}
                onChange={(e) => setSelectedTipoId(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
              >
                <option value="">— Nenhum —</option>
                {tiposAtivos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}{t.tamanho ? ` · ${t.tamanho}` : ""}{t.cor ? ` · ${t.cor}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tiposAtivos.length === 0 && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-stone-800">
              <p className="text-xs text-gray-400 dark:text-stone-500">Nenhum tipo cadastrado</p>
            </div>
          )}
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStatus(s)}
              className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-stone-800 ${s === status ? "font-semibold" : ""}`}
            >
              <span className={`rounded-full px-2 py-0.5 ${STATUS_BADGE_CLASS[s]}`}>
                {STATUS_LABEL[s]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
