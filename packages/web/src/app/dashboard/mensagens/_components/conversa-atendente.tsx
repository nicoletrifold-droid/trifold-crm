"use client"

import { useEffect, useState, useCallback } from "react"
import { UserCog, X, Plus } from "lucide-react"

interface Pessoa {
  id: string
  name: string
}

interface ConversaState {
  assigned_to: string | null
  assigned_name: string | null
  participants: Pessoa[]
  staff: Pessoa[]
}

interface Props {
  obraId: string
  clienteId: string
}

// Story 75-16/17 — barra de atendimento da conversa do portal:
// atendente responsável (transferir/devolver) + participantes.
export function ConversaAtendente({ obraId, clienteId }: Props) {
  const [state, setState] = useState<ConversaState | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/mensagens/conversa?obra_id=${obraId}&cliente_id=${clienteId}`
      )
      if (res.ok) setState((await res.json()) as ConversaState)
    } catch {
      /* silencioso */
    }
  }, [obraId, clienteId])

  useEffect(() => {
    setState(null)
    setAdding(false)
    void load()
  }, [load])

  async function transferir(assignedTo: string) {
    setBusy(true)
    try {
      await fetch(`/api/admin/mensagens/conversa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra_id: obraId, cliente_id: clienteId, assigned_to: assignedTo || null }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function addParticipant(userId: string) {
    if (!userId) return
    setBusy(true)
    try {
      await fetch(`/api/admin/mensagens/conversa/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra_id: obraId, cliente_id: clienteId, user_id: userId }),
      })
      setAdding(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function removeParticipant(userId: string) {
    setBusy(true)
    try {
      await fetch(`/api/admin/mensagens/conversa/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra_id: obraId, cliente_id: clienteId, user_id: userId }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  const participantIds = new Set(state.participants.map((p) => p.id))
  const addOpcoes = state.staff.filter(
    (s) => s.id !== state.assigned_to && !participantIds.has(s.id)
  )

  const selectCls =
    "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-orange-500 focus:outline-none disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-xs dark:border-stone-800 dark:bg-stone-900/40">
      {/* Atendente */}
      <div className="flex items-center gap-1.5">
        <UserCog className="h-3.5 w-3.5 text-gray-400 dark:text-stone-500" />
        <span className="text-gray-500 dark:text-stone-400">Atendente:</span>
        <select
          value={state.assigned_to ?? ""}
          disabled={busy}
          onChange={(e) => void transferir(e.target.value)}
          className={selectCls}
          title="Transferir atendimento"
        >
          <option value="">— Sem atendente —</option>
          {state.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Participantes */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-gray-500 dark:text-stone-400">Participantes:</span>
        {state.participants.length === 0 && (
          <span className="text-gray-400 dark:text-stone-500">nenhum</span>
        )}
        {state.participants.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
          >
            {p.name}
            <button
              type="button"
              onClick={() => void removeParticipant(p.id)}
              disabled={busy}
              className="hover:text-orange-900 dark:hover:text-orange-100"
              title="Remover"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {adding ? (
          <select
            autoFocus
            disabled={busy}
            defaultValue=""
            onChange={(e) => void addParticipant(e.target.value)}
            className={selectCls}
          >
            <option value="" disabled>
              Escolher…
            </option>
            {addOpcoes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          addOpcoes.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-gray-500 hover:border-orange-400 hover:text-orange-600 dark:border-stone-600 dark:text-stone-400"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          )
        )}
      </div>
    </div>
  )
}
