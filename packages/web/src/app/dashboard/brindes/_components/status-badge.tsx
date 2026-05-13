"use client"

import { useState, useRef, useEffect } from "react"
import type { EntregaStatus } from "./types"
import { STATUS_LABEL, STATUS_BADGE_CLASS } from "./types"

interface StatusBadgeProps {
  status: EntregaStatus
  disabled: boolean
  destinatarioId: string
  dataComemorativaId: string
  onStatusChange: (destinatarioId: string, newStatus: EntregaStatus) => void
}

const ALL_STATUSES: EntregaStatus[] = ["pendente", "entregue", "nao_encontrado"]

export function StatusBadge({
  status,
  disabled,
  destinatarioId,
  dataComemorativaId,
  onStatusChange,
}: StatusBadgeProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
    if (loading || newStatus === status) { setOpen(false); return }
    setLoading(true)
    setOpen(false)
    try {
      const res = await fetch("/api/brindes/entregas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatario_id: destinatarioId, data_comemorativa_id: dataComemorativaId, status: newStatus }),
      })
      if (res.ok) {
        onStatusChange(destinatarioId, newStatus)
      }
    } finally {
      setLoading(false)
    }
  }

  if (disabled) {
    return <span className="text-xs text-gray-400">—</span>
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !loading && setOpen((o) => !o)}
        disabled={loading}
        className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${STATUS_BADGE_CLASS[status]} ${loading ? "opacity-50" : "hover:ring-1 hover:ring-offset-1 hover:ring-gray-400"}`}
      >
        {loading ? "..." : STATUS_LABEL[status]}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStatus(s)}
              className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${s === status ? "font-semibold" : ""}`}
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
