"use client"

import { useState } from "react"
import { XCircle } from "lucide-react"
import { LOST_REASON_GROUPS } from "@web/lib/constants"

/**
 * Story 75-264 — modal único de "Marcar como Perdido": grupo estruturado
 * (obrigatório) + observação livre (opcional, permanece ao lado do grupo).
 * Usado pelo drawer do lead (que atende dashboard, /broker, imob e kanban-drawer)
 * e pelo drop no Kanban. Faz o POST em /api/leads/[id]/mark-lost.
 */
export function MarkLostModal({
  leadId,
  leadName,
  type,
  onSuccess,
  onCancel,
}: {
  leadId: string
  leadName: string | null
  /** Etapa destino: "nao_qualificado" quando o drop foi na coluna Não Qualificado. */
  type?: "represamento" | "nao_qualificado"
  onSuccess: () => void
  onCancel: () => void
}) {
  const [grupo, setGrupo] = useState("")
  const [observacao, setObservacao] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!grupo) {
      setError("Selecione o motivo da perda.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/mark-lost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo, reason: observacao.trim() || undefined, type }),
      })
      if (res.ok) {
        onSuccess()
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Erro ao marcar lead como perdido.")
      }
    } catch {
      setError("Erro de conexão.")
    } finally {
      setSaving(false)
    }
  }

  function close() {
    if (saving) return
    onCancel()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <XCircle className="h-4 w-4 text-red-500" />
          Marcar como Perdido
        </h3>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          {leadName ?? "O lead"} sai do funil. O motivo alimenta os relatórios de
          perda — escolha o grupo que melhor descreve.
        </p>

        <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
          Motivo da perda <span className="text-red-500">*</span>
        </label>
        <select
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
        >
          <option value="">Selecione…</option>
          {LOST_REASON_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
          Observação <span className="text-stone-400">(opcional)</span>
        </label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={3}
          placeholder="Ex.: cliente é de Londrina; comprou terreno em vez de apartamento."
          className="mt-1 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
        />

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={close}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Marcar como Perdido"}
          </button>
        </div>
      </div>
    </div>
  )
}
