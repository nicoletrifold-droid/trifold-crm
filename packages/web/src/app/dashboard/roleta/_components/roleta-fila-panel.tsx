"use client"

import { useState, useTransition } from "react"
import { Users, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"

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
  const [isPending, startTransition] = useTransition()

  function addBroker() {
    if (!selectedBroker) return
    startTransition(async () => {
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
      }
    })
  }

  function toggleEntry(id: string, currentActive: boolean) {
    startTransition(async () => {
      const res = await fetch("/api/roleta/fila", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      if (res.ok) {
        setFila((f) =>
          f.map((e) => (e.id === id ? { ...e, is_active: !currentActive } : e))
        )
      }
    })
  }

  function removeEntry(entry: FilaEntry) {
    startTransition(async () => {
      const res = await fetch(`/api/roleta/fila?id=${entry.id}`, { method: "DELETE" })
      if (res.ok) {
        setFila((f) => f.filter((e) => e.id !== entry.id))
        setAvailable((a) => [
          ...a,
          { brokerId: entry.broker_id, name: entry.brokerName, email: entry.brokerEmail },
        ])
      }
    })
  }

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-5 space-y-4">
      <h2 className="text-base font-semibold text-white flex items-center gap-2">
        <Users className="h-4 w-4" />
        Fila de Corretores
        <span className="ml-auto text-xs font-normal text-stone-500">{fila.length} corretor(es)</span>
      </h2>

      {fila.length === 0 ? (
        <p className="text-sm text-stone-500 py-4 text-center">
          Nenhum corretor na fila. Adicione corretores abaixo.
        </p>
      ) : (
        <div className="space-y-2">
          {fila.map((entry, idx) => (
            <div
              key={entry.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                entry.is_active
                  ? "border-stone-700 bg-stone-800"
                  : "border-stone-800 bg-stone-900 opacity-50"
              }`}
            >
              <span className="text-xs font-bold text-stone-500 w-5 text-center">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{entry.brokerName}</p>
                <p className="text-xs text-stone-500 truncate">{entry.brokerEmail}</p>
              </div>
              {idx === 0 && entry.is_active && (
                <span className="flex-shrink-0 rounded-full bg-emerald-950 border border-emerald-700 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  Próximo
                </span>
              )}
              <button
                onClick={() => toggleEntry(entry.id, entry.is_active)}
                disabled={isPending}
                title={entry.is_active ? "Pausar" : "Ativar"}
                className="text-stone-500 hover:text-stone-300 transition-colors"
              >
                {entry.is_active ? (
                  <ToggleRight className="h-5 w-5 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => removeEntry(entry)}
                disabled={isPending}
                title="Remover da fila"
                className="text-stone-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2 pt-2">
          <select
            value={selectedBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
            className="flex-1 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-[#E8856A] focus:outline-none"
          >
            <option value="">Selecionar corretor…</option>
            {available.map((b) => (
              <option key={b.brokerId} value={b.brokerId}>
                {b.name} — {b.email}
              </option>
            ))}
          </select>
          <button
            onClick={addBroker}
            disabled={!selectedBroker || isPending}
            className="flex items-center gap-1.5 rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      )}

      {available.length === 0 && fila.length > 0 && (
        <p className="text-xs text-stone-500 pt-1">
          Todos os corretores disponíveis já estão na fila.
        </p>
      )}
    </div>
  )
}
