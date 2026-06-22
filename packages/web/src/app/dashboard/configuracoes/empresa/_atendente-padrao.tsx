"use client"

import { useEffect, useState } from "react"
import { Headset } from "lucide-react"

interface Pessoa {
  id: string
  name: string
}

// Story 75-16 (AC7) — escolhe o atendente padrão do portal (pra quem caem as
// novas conversas de cliente).
export function AtendentePadraoConfig() {
  const [staff, setStaff] = useState<Pessoa[]>([])
  const [value, setValue] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/config/atendente-padrao")
      .then((r) => r.json())
      .then((d) => {
        setStaff(d.staff ?? [])
        setValue(d.atendente_padrao_id ?? "")
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(novo: string) {
    setValue(novo)
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/admin/config/atendente-padrao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atendente_padrao_id: novo || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao salvar")
      }
      setFeedback("Atendente padrão atualizado.")
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="mb-1 flex items-center gap-2">
        <Headset className="h-4 w-4 text-orange-500" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-stone-100">
          Atendente padrão do portal
        </h2>
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-stone-400">
        Toda nova conversa de cliente no portal cai para este atendente responder
        (ele pode transferir depois).
      </p>
      {loading ? (
        <p className="text-sm text-gray-400 dark:text-stone-500">Carregando…</p>
      ) : (
        <>
          <select
            value={value}
            disabled={saving}
            onChange={(e) => void handleChange(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          >
            <option value="">— Sem atendente padrão —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {feedback && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">{feedback}</p>
          )}
        </>
      )}
    </div>
  )
}
