"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

type Granularity = "day" | "week" | "month"
type Preset = "7d" | "30d" | "90d" | "custom"

interface PeriodEntry {
  period: string
  count: number
  byProperty: Record<string, number>
}

interface Summary {
  total: number
  dailyAvg: number
  peakPeriod: string
  peakCount: number
}

interface Property {
  id: string
  name: string
}

const SOURCE_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "whatsapp_organic", label: "WhatsApp" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "whatsapp_click_to_ad", label: "CTWA" },
  { value: "walk_in", label: "Manual" },
]

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
]

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "custom", label: "Custom" },
]

function getPresetRange(preset: Preset): { from: string; to: string } | null {
  if (preset === "custom") return null
  const to = new Date()
  const from = new Date()
  const days = { "7d": 7, "30d": 30, "90d": 90 }[preset]
  from.setDate(from.getDate() - days)
  return { from: from.toISOString(), to: to.toISOString() }
}

function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [year, month] = period.split("-")
    return new Date(Number(year), Number(month) - 1).toLocaleDateString("pt-BR", {
      month: "short",
      year: "2-digit",
    })
  }
  const d = new Date(period + "T12:00:00Z")
  if (granularity === "week") {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function formatPeriodFull(period: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [year, month] = period.split("-")
    return new Date(Number(year), Number(month) - 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    })
  }
  const d = new Date(period + "T12:00:00Z")
  if (granularity === "week") {
    return `Semana de ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: PeriodEntry }>
  label?: string
  granularity: Granularity
}

function CustomTooltip({ active, payload, label, granularity }: TooltipProps) {
  if (!active || !payload?.length || !label) return null
  const first = payload[0]
  if (!first) return null
  const d = first.payload
  const hasBreakdown = Object.keys(d.byProperty).length > 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-sm dark:border-stone-800 dark:bg-stone-900">
      <p className="font-semibold text-gray-800 mb-1 dark:text-stone-100">{formatPeriodFull(label, granularity)}</p>
      <p className="text-gray-700 dark:text-stone-300">
        Total: <span className="font-bold text-orange-600 dark:text-orange-300">{d.count}</span>
      </p>
      {hasBreakdown && (
        <div className="mt-1 border-t border-gray-100 pt-1 space-y-0.5 dark:border-stone-800">
          {Object.entries(d.byProperty)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => (
              <p key={name} className="text-gray-500 dark:text-stone-400">
                {name}: <span className="font-medium text-gray-700 dark:text-stone-300">{count}</span>
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  properties: Property[]
}

export function LeadsChart({ properties }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("day")
  const [preset, setPreset] = useState<Preset>("30d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [property, setProperty] = useState("")
  const [source, setSource] = useState("")
  const [data, setData] = useState<PeriodEntry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    let from: string
    let to: string

    if (preset === "custom") {
      if (!customFrom || !customTo) return
      from = new Date(customFrom).toISOString()
      to = new Date(customTo + "T23:59:59").toISOString()
    } else {
      const range = getPresetRange(preset)!
      from = range.from
      to = range.to
    }

    setLoading(true)
    setError(false)

    const params = new URLSearchParams({ from, to, granularity })
    if (property) params.set("property", property)
    if (source) params.set("source", source)

    try {
      const res = await fetch(`/api/analytics/leads-by-period?${params}`)
      if (!res.ok) throw new Error("API error")
      const json = await res.json()
      setData(json.data ?? [])
      setSummary(json.summary ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [granularity, preset, property, source, customFrom, customTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const propertyOptions = [{ id: "", name: "Todos" }, ...properties]
  const ticks = data.length <= 31 ? undefined : data.filter((_, i) => i % Math.ceil(data.length / 20) === 0).map((d) => d.period)

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900 mr-auto dark:text-stone-100">Leads por Período</h2>

        {/* Granularity toggle — AC3 */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm dark:border-stone-800">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGranularity(opt.value)}
              className={`px-3 py-1.5 transition-colors ${
                granularity === opt.value
                  ? "bg-orange-500 text-white font-medium"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Preset selector — AC4 */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm dark:border-stone-800">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPreset(opt.value)}
              className={`px-3 py-1.5 transition-colors ${
                preset === opt.value
                  ? "bg-orange-500 text-white font-medium"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range inputs — AC4 */}
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-gray-600 dark:text-stone-400">De:</label>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
          <label className="text-gray-600 dark:text-stone-400">Até:</label>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>
      )}

      {/* Secondary filters — AC5 + AC6 */}
      <div className="flex flex-wrap gap-3 text-sm">
        {/* Property filter — AC5 */}
        <select
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          className="rounded border border-gray-200 px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          {propertyOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Source filter — AC6 */}
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded border border-gray-200 px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Chart — AC2 + AC7 */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded z-10 dark:bg-stone-900/70">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        )}
        {error ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400 dark:text-stone-500">
            Erro ao carregar dados.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="period"
                tickFormatter={(v) => formatPeriodLabel(v, granularity)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                ticks={ticks}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                content={<CustomTooltip granularity={granularity} />}
                cursor={{ fill: "#fff7ed" }}
              />
              <Bar
                dataKey="count"
                fill="#f97316"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary cards — AC8 */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 dark:border-stone-800">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-stone-400">Total no período</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900 dark:text-stone-100">{summary.total}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-stone-400">Média diária</p>
            <p className="mt-0.5 text-2xl font-bold text-blue-600 dark:text-blue-300">{summary.dailyAvg}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-stone-400">Pico ({formatPeriodLabel(summary.peakPeriod, granularity)})</p>
            <p className="mt-0.5 text-2xl font-bold text-orange-600 dark:text-orange-300">{summary.peakCount}</p>
          </div>
        </div>
      )}
    </div>
  )
}
