"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft } from "lucide-react"

export interface TargetUser {
  id: string
  name: string | null
  role: string
}

const ROLE_LABEL: Record<string, string> = {
  broker: "Corretor",
  admin: "Admin",
  supervisor: "Supervisor",
  "gerente-relacionamento": "Relacionamento",
}

export function TransferConversa({ leadId, targets }: { leadId: string; targets: TargetUser[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState("")
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!targetId) { setError("Selecione o usuário destino."); return }
    if (!motivo.trim()) { setError("O motivo é obrigatório."); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: targetId, motivo: motivo.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        setOpen(false)
        setTargetId(""); setMotivo("")
        router.refresh()
      } else {
        setError(data.error ?? "Falha ao transferir.")
      }
    } catch {
      setError("Erro de conexão.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
      >
        <ArrowRightLeft className="h-4 w-4" /> Transferir conversa
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Transferir conversa</h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              O lead sai da base do dono atual e passa para o usuário escolhido, que será notificado.
            </p>

            <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">Transferir para</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            >
              <option value="">Selecione um usuário…</option>
              {targets.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? "Sem nome"} — {ROLE_LABEL[u.role] ?? u.role}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
              Motivo da transferência <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente da base, deveria ser atendido pelo relacionamento."
              className="mt-1 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            />

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submit()}
                disabled={saving}
                className="rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d6724f] disabled:opacity-50"
              >
                {saving ? "Transferindo…" : "Transferir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
