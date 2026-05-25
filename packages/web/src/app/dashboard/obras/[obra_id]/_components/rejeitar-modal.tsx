"use client"

import { useState, useEffect, useRef } from "react"
import { X } from "lucide-react"

interface RejeitarModalProps {
  onConfirm: (motivo: string) => void
  onCancel: () => void
  loading?: boolean
}

export function RejeitarModal({ onConfirm, onCancel, loading }: RejeitarModalProps) {
  const [motivo, setMotivo] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [loading, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel()
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-stone-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-stone-100">
            Rejeitar upload
          </h2>
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-500 dark:hover:bg-stone-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-stone-300">
            Motivo da rejeição <span className="text-red-500">*</span>
          </label>
          <textarea
            ref={textareaRef}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={loading}
            rows={3}
            placeholder="Descreva o motivo da rejeição..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-stone-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo)}
            disabled={loading || !motivo.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Rejeitando..." : "Confirmar rejeição"}
          </button>
        </div>
      </div>
    </div>
  )
}
