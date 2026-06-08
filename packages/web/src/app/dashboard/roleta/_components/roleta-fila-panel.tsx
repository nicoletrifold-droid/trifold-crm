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
  const [selectedBrokers, setSelectedBrokers] = useState<Set<string>>(new Set())
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isAdding, startAddTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  function toggleSelectBroker(brokerId: string) {
    setSelectedBrokers((prev) => {
      const next = new Set(prev)
      if (next.has(brokerId)) next.delete(brokerId)
      else next.add(brokerId)
      return next
    })
  }

  function selectAll() {
    setSelectedBrokers(new Set(available.map((b) => b.brokerId)))
  }

  function clearSelection() {
    setSelectedBrokers(new Set())
  }

  function addBrokers() {
    if (selectedBrokers.size === 0) return
    setError(null)
    const toAdd = available.filter((b) => selectedBrokers.has(b.brokerId))
    startAddTransition(async () => {
      const results = await Promise.all(
        toAdd.map((broker) =>
          fetch("/api/roleta/fila", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ broker_id: broker.brokerId }),
          })
        )
      )
      const failures = results.filter((r) => !r.ok).length
      const successes = toAdd.filter((_, i) => results[i]!.ok)
      if (successes.length > 0) {
        setFila((f) => {
          let pos = f.length > 0 ? Math.max(...f.map((e) => e.position)) + 1 : 0
          return [
            ...f,
            ...successes.map((broker) => ({
              id: crypto.randomUUID(),
              position: pos++,
              is_active: true,
              broker_id: broker.brokerId,
              brokerName: broker.name,
              brokerEmail: broker.email,
              brokerPhone: null,
            })),
          ]
        })
        setAvailable((a) => a.filter((b) => !successes.some((s) => s.brokerId === b.brokerId)))
        setSelectedBrokers(new Set())
      }
      if (failures > 0) {
        setError(`${failures} corretor(es) não puderam ser adicionados. Tente novamente.`)
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
            <Link href="/dashboard/configuracoes/corretores" className="underline hover:text-stone-600 dark:hover:text-stone-400">
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

      {/* Multi-select de corretores disponíveis */}
      {available.length > 0 && (
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">
              Adicionar corretores ({available.length} disponíveis)
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-[#E8856A] hover:underline"
              >
                Selecionar todos
              </button>
              {selectedBrokers.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-700 divide-y divide-stone-100 dark:divide-stone-800 max-h-48 overflow-y-auto">
            {available.map((b) => (
              <label
                key={b.brokerId}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedBrokers.has(b.brokerId)}
                  onChange={() => toggleSelectBroker(b.brokerId)}
                  className="h-4 w-4 rounded border-stone-300 accent-[#E8856A] dark:border-stone-700 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-stone-100 truncate">{b.name}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{b.email}</p>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={addBrokers}
            disabled={selectedBrokers.size === 0 || isAdding}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            {selectedBrokers.size > 0
              ? `Adicionar ${selectedBrokers.size} corretor${selectedBrokers.size > 1 ? "es" : ""}`
              : "Selecione corretores acima"}
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
