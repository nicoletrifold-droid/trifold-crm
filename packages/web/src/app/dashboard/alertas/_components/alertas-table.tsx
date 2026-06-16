"use client"

import Link from "next/link"
import { useState, useMemo } from "react"
import { ChevronUp, ChevronDown, ChevronsUpDown, X } from "lucide-react"

export interface AlertItem {
  id: string
  leadId: string
  leadName: string
  stageName: string
  daysSinceContact: number
  propertyName: string
  brokerName: string
  sourceName: string
  type: string
  source: "log" | "stale"
}

type SortKey = "leadName" | "daysSinceContact" | "propertyName" | "brokerName"
type SortDir = "asc" | "desc"

interface Props {
  alerts: AlertItem[]
}

const EMPTY_FILTERS = {
  broker: "",
  property: "",
  source: "",
  minDays: "",
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="inline h-3 w-3 opacity-40" />
  return sortDir === "asc"
    ? <ChevronUp className="inline h-3 w-3 text-orange-500" />
    : <ChevronDown className="inline h-3 w-3 text-orange-500" />
}

function ThBtn({
  col, label, sortKey, sortDir, onSort,
}: {
  col: SortKey
  label: string
  sortKey: SortKey
  sortDir: SortDir
  onSort: (col: SortKey) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex items-center gap-1 font-medium uppercase tracking-wider hover:text-orange-500"
    >
      {label}
      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </button>
  )
}

function NicoleButton() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      await fetch("/api/alertas/nicole-trigger", { method: "POST" })
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || done}
      className="rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-60 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/20"
    >
      {done ? "Enviado ✓" : loading ? "…" : "Nicole enviar agora"}
    </button>
  )
}

function MarcarFeitoButton({ alertId, onDone }: { alertId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      await fetch("/api/alertas/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      })
      onDone()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/20"
    >
      {loading ? "…" : "Marcar como feito"}
    </button>
  )
}

export function AlertasTable({ alerts: initialAlerts }: Props) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>("daysSinceContact")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const brokerOptions = useMemo(
    () => [...new Set(alerts.map((a) => a.brokerName))].sort(),
    [alerts]
  )
  const propertyOptions = useMemo(
    () => [...new Set(alerts.map((a) => a.propertyName).filter((p) => p !== "-"))].sort(),
    [alerts]
  )
  const sourceOptions = useMemo(
    () => [...new Set(alerts.map((a) => a.sourceName).filter(Boolean))].sort(),
    [alerts]
  )

  const hasActiveFilters =
    filters.broker !== "" ||
    filters.property !== "" ||
    filters.source !== "" ||
    filters.minDays !== ""

  const filtered = useMemo(() => {
    let list = alerts
    if (filters.broker) list = list.filter((a) => a.brokerName === filters.broker)
    if (filters.property) list = list.filter((a) => a.propertyName === filters.property)
    if (filters.source) list = list.filter((a) => a.sourceName === filters.source)
    if (filters.minDays) {
      const min = parseInt(filters.minDays, 10)
      if (!isNaN(min)) list = list.filter((a) => a.daysSinceContact >= min)
    }
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === "daysSinceContact") cmp = a.daysSinceContact - b.daysSinceContact
      else if (sortKey === "leadName") cmp = a.leadName.localeCompare(b.leadName, "pt-BR")
      else if (sortKey === "propertyName") cmp = a.propertyName.localeCompare(b.propertyName, "pt-BR")
      else if (sortKey === "brokerName") cmp = a.brokerName.localeCompare(b.brokerName, "pt-BR")
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [alerts, filters, sortKey, sortDir])

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(col)
      setSortDir(col === "daysSinceContact" ? "desc" : "asc")
    }
  }

  const selectCls =
    "rounded border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Corretor</label>
          <select
            value={filters.broker}
            onChange={(e) => setFilters((f) => ({ ...f, broker: e.target.value }))}
            className={selectCls}
          >
            <option value="">Todos</option>
            {brokerOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Empreendimento</label>
          <select
            value={filters.property}
            onChange={(e) => setFilters((f) => ({ ...f, property: e.target.value }))}
            className={selectCls}
          >
            <option value="">Todos</option>
            {propertyOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {sourceOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Origem</label>
            <select
              value={filters.source}
              onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
              className={selectCls}
            >
              <option value="">Todas</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Dias mínimos</label>
          <input
            type="number"
            min={0}
            placeholder="ex: 7"
            value={filters.minDays}
            onChange={(e) => setFilters((f) => ({ ...f, minDays: e.target.value }))}
            className={`w-20 ${selectCls}`}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="flex items-center gap-1 rounded border border-stone-200 px-2 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">
          {filtered.length} de {alerts.length}
        </span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-stone-400 dark:text-stone-500">
            Nenhum alerta com os filtros selecionados.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
                <th className="px-6 py-3"><ThBtn col="leadName" label="Lead" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="px-6 py-3 font-medium uppercase tracking-wider">Etapa</th>
                <th className="px-6 py-3"><ThBtn col="daysSinceContact" label="Dias sem contato" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="px-6 py-3"><ThBtn col="propertyName" label="Empreendimento" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="px-6 py-3"><ThBtn col="brokerName" label="Corretor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
                {sourceOptions.length > 0 && (
                  <th className="px-6 py-3 font-medium uppercase tracking-wider">Origem</th>
                )}
                <th className="px-6 py-3 font-medium uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {filtered.map((alert) => {
                const urgencyClass =
                  alert.daysSinceContact > 4
                    ? "text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/15"
                    : alert.daysSinceContact > 2
                    ? "text-orange-600 bg-orange-50 dark:text-orange-300 dark:bg-orange-500/15"
                    : "text-gray-600 bg-gray-50 dark:text-stone-300 dark:bg-stone-800/50"

                return (
                  <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                      {alert.leadName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {alert.stageName}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${urgencyClass}`}>
                        {alert.daysSinceContact}d
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {alert.propertyName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                      {alert.brokerName}
                    </td>
                    {sourceOptions.length > 0 && (
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                        {alert.sourceName || "—"}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <NicoleButton />
                        {alert.source === "log" && (
                          <MarcarFeitoButton
                            alertId={alert.id}
                            onDone={() =>
                              setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                            }
                          />
                        )}
                        <Link
                          href={`/dashboard/leads/${alert.leadId}`}
                          className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/15"
                        >
                          Ver lead
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
