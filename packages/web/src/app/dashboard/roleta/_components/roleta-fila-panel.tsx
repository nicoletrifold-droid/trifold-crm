"use client"

import { useState, useTransition } from "react"
import { Users, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import Link from "next/link"

interface FilaEntry {
  id: string
  position: number
  is_active: boolean
  broker_id: string
  brokerName: string
  brokerEmail: string
  brokerPhone: string | null
}

interface BrokerOption {
  brokerId: string
  name: string
  email: string
}

interface Props {
  fila: FilaEntry[]
  availableBrokers: BrokerOption[]
}

export function RoletaFilaPanel({ fila: initialFila, availableBrokers: initialAvailable }: Props) {
  const [fila, setFila] = useState<FilaEntry[]>(initialFila)
  const [available, setAvailable] = useState<BrokerOption[]>(initialAvailable)
  const [selectedBroker, setSelectedBroker] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isAdding, startAddTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Two-step remove confirmation
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  function addBroker() {
    if (!selectedBroker) return
    setError(null)
    startAddTransition(async () => {
      const res = await fetch("/api/roleta/fila", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker_id: selectedBroker }),
      })
      if (res.ok) {
        const broker = available.find((b) => b.brokerId === selectedBroker)
        if (broker) {
          const newPos = fila.length > 0 ? Math.max(...fila.map((f) => f.position)) + 1 : 0
          setFila((f) => [
            ...f,
            {
              id: crypto.randomUUID(),
              position: newPos,
              is_active: true,
              broker_id: broker.brokerId,
              brokerName: broker.name,
              brokerEmail: broker.email,
              brokerPhone: null,
            },
          ])
          setAvailable((a) => a.filter((b) => b.brokerId !== selectedBroker))
          setSelectedBroker("")
        }
      } else {
        setError("Erro ao adicionar corretor. Tente novamente.")
      }
    })
  }

  async function toggleEntry(id: string, currentActive: boolean) {
    setPendingId(id)
    setError(null)
    const res = await fetch("/api/roleta/fila", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !currentActive }),
    })
    if (res.ok) {
      setFila((f) => f.map((e) => (e.id === id ? { ...e, is_active: !currentActive } : e)))
    } else {
      setError("Erro ao atualizar. Tente novamente.")
    }
    setPendingId(null)
  }

  async function removeEntry(entry: FilaEntry) {
    setPendingId(entry.id)
    setError(null)
    const res = await fetch(`/api/roleta/fila?id=${entry.id}`, { method: "DELETE" })
    if (res.ok) {
      setFila((f) => f.filter((e) => e.id !== entry.id))
      setAvailable((a) => [
        ...a,
        { brokerId: entry.broker_id, name: entry.brokerName, email: entry.brokerEmail },
      ])
    } else {
      setError("Erro ao remover. Tente novamente.")
    }
    setPendingId(null)
    setConfirmRemoveId(null)
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Users className="h-4 w-4" />
        Fila de Corretores
        <span className="ml-auto text-xs font-normal text-stone-400 dark:text-stone-500">{fila.length} corretor(es)</span>
      </h2>

      {error && (
        <p role="alert" className="text-xs text-red-400">{error}</p>
      )}

      {fila.length === 0 && available.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Users className="h-8 w-8 text-stone-300 dark:text-stone-700" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Nenhum corretor disponível.</p>
          <p className="text-xs text-stone-400 dark:text-stone-600">
            Ative corretores na página de{" "}
            <Link href="/dashboard/corretores" className="underline hover:text-stone-600 dark:hover:text-stone-400">
              Corretores
            </Link>{" "}
            primeiro.
          </p>
        </div>
      ) : fila.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Users className="h-8 w-8 text-stone-300 dark:text-stone-700" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Nenhum corretor na fila.</p>
          <p className="text-xs text-stone-400 dark:text-stone-600">Selecione um corretor abaixo para começar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fila.map((entry, idx) => {
            const isThisPending = pendingId === entry.id
            const isConfirming = confirmRemoveId === entry.id
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-opacity ${
                  entry.is_active
                    ? "border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800"
                    : "border-stone-100 bg-white opacity-50 dark:border-stone-800 dark:bg-stone-900"
                } ${isThisPending ? "animate-pulse" : ""}`}
              >
                <span className="text-xs font-bold text-stone-400 dark:text-stone-500 w-5 text-center shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{entry.brokerName}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 truncate hidden sm:block">{entry.brokerEmail}</p>
                </div>
                {idx === 0 && entry.is_active && (
                  <span className="flex-shrink-0 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-400">
                    Próximo
                  </span>
                )}
                {/* Toggle */}
                <button
                  onClick={() => toggleEntry(entry.id, entry.is_active)}
                  disabled={isThisPending}
                  aria-label={entry.is_active ? `Pausar ${entry.brokerName}` : `Ativar ${entry.brokerName}`}
                  aria-pressed={entry.is_active}
                  title={entry.is_active ? "Pausar" : "Ativar"}
                  className="text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-40 dark:text-stone-500 dark:hover:text-stone-300"
                >
                  {entry.is_active ? (
                    <ToggleRight className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
                {/* Two-step remove */}
                {isConfirming ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => removeEntry(entry)}
                      disabled={isThisPending}
                      className="text-xs font-semibold text-red-500 hover:text-red-400 disabled:opacity-40 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      className="text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(entry.id)}
                    disabled={isThisPending}
                    aria-label={`Remover ${entry.brokerName} da fila`}
                    title="Remover da fila"
                    className="text-stone-400 hover:text-red-500 transition-colors disabled:opacity-40 dark:text-stone-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isAdding && (
        <p className="text-xs text-stone-400 dark:text-stone-500 animate-pulse">Adicionando…</p>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2 pt-2">
          <select
            value={selectedBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
            className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            <option value="" disabled>Selecionar corretor…</option>
            {available.map((b) => (
              <option key={b.brokerId} value={b.brokerId}>
                {b.name} — {b.email}
              </option>
            ))}
          </select>
          <button
            onClick={addBroker}
            disabled={!selectedBroker || isAdding}
            className="flex items-center gap-1.5 rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      )}

      {available.length === 0 && fila.length > 0 && (
        <p className="text-xs text-stone-400 dark:text-stone-500 pt-1">
          Todos os corretores disponíveis já estão na fila.
        </p>
      )}
    </div>
  )
}
