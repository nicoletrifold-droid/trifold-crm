"use client"

/**
 * Visão Executiva do Analytics — 6 gráficos de alto impacto para leitura
 * visual rápida (diretor). Dados vêm em UMA chamada (/api/analytics/executive)
 * e respeitam o período global + filtro de empreendimento da página.
 *
 * Paletas validadas (light E dark) pelo validador da skill dataviz — cores
 * seguem a ENTIDADE (origem/desfecho), nunca o rank; cinza é sempre contexto
 * ("Outros", período anterior), nunca identidade.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ExecutiveData, OutcomeRow } from "@web/lib/analytics/executive"

interface Palette {
  surface: string
  grid: string
  tick: string
  brand: string
  prev: string
  cat: string[]
  outros: string
  outcome: { fechado: string; ativo: string; perdido: string; outro: string }
  visits: { realizada: string; agendada: string; noShow: string; cancelada: string }
  /** Rampa sequencial do heatmap — índice 0 = zero (recua pra superfície). */
  heat: string[]
}

const LIGHT: Palette = {
  surface: "#ffffff",
  grid: "#eeedec",
  tick: "#9ca3af",
  brand: "#ea580c",
  prev: "#a8a29e",
  cat: ["#ea580c", "#2a78d6", "#199e70", "#4a3aa7"],
  outros: "#78716c",
  outcome: { fechado: "#16a34a", ativo: "#3b82f6", perdido: "#dc2626", outro: "#a8a29e" },
  visits: { realizada: "#16a34a", agendada: "#3b82f6", noShow: "#d97706", cancelada: "#a8a29e" },
  heat: ["#fafaf9", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c"],
}

const DARK: Palette = {
  surface: "#1c1917",
  grid: "#292524",
  tick: "#78716c",
  brand: "#ea580c",
  prev: "#78716c",
  cat: ["#ea580c", "#3987e5", "#1baf7a", "#9085e9"],
  outros: "#78716c",
  outcome: { fechado: "#16a34a", ativo: "#3b82f6", perdido: "#dc2626", outro: "#78716c" },
  visits: { realizada: "#16a34a", agendada: "#3b82f6", noShow: "#d97706", cancelada: "#78716c" },
  heat: ["#292524", "#431407", "#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316", "#fb923c"],
}

const CARD = "rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
const TITLE = "text-lg font-semibold text-gray-900 dark:text-stone-100"
const SUBTITLE = "text-xs text-gray-400 dark:text-stone-500"

function formatDay(date: string): string {
  const d = new Date(date + "T12:00:00Z")
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function thinTicks<T>(items: T[], max = 16): T[] | undefined {
  if (items.length <= max) return undefined
  const step = Math.ceil(items.length / max)
  return items.filter((_, i) => i % step === 0)
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-stone-400">
          <Swatch color={it.color} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg dark:border-stone-800 dark:bg-stone-900">
      {children}
    </div>
  )
}

// ── 1. Ritmo de entradas: atual × período anterior (acumulado) ───────────────

function ComparisonChart({ data, p, rangeLabel }: { data: ExecutiveData["comparison"]; p: Palette; rangeLabel: string }) {
  const { points, totals } = data
  const delta = totals.deltaPct
  const deltaChip =
    delta == null ? null : (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          delta > 0
            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
            : delta < 0
              ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
              : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
        }`}
      >
        {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}
        {delta}% vs anterior
      </span>
    )

  const ticks = thinTicks(points.map((pt) => pt.date))

  return (
    <div className={CARD}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className={TITLE}>Ritmo de Entradas</h2>
        {deltaChip}
      </div>
      <p className={`mb-4 ${SUBTITLE}`}>
        Acumulado do período ({totals.current}) contra o período anterior de mesma duração ({totals.previous}) · {rangeLabel}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDay}
            tick={{ fontSize: 11, fill: p.tick }}
            axisLine={false}
            tickLine={false}
            ticks={ticks}
          />
          <YAxis tick={{ fontSize: 11, fill: p.tick }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <Tooltip
            content={({ active, payload }) => {
              const pt = payload?.[0]?.payload as ExecutiveData["comparison"]["points"][number] | undefined
              if (!active || !pt) return null
              return (
                <TooltipBox>
                  <p className="mb-1 font-semibold text-gray-800 dark:text-stone-100">Dia {pt.index} · {formatDay(pt.date)}</p>
                  <p className="text-gray-700 dark:text-stone-300">
                    Atual: <span className="font-bold" style={{ color: p.brand }}>{pt.cumulative}</span>
                    <span className="ml-1 text-xs text-gray-400 dark:text-stone-500">({pt.count} no dia)</span>
                  </p>
                  {pt.prevCumulative != null && (
                    <p className="text-gray-500 dark:text-stone-400">
                      Anterior: <span className="font-semibold">{pt.prevCumulative}</span>
                      {pt.prevDate && <span className="ml-1 text-xs text-gray-400 dark:text-stone-500">({formatDay(pt.prevDate)})</span>}
                    </p>
                  )}
                </TooltipBox>
              )
            }}
          />
          <Line type="monotone" dataKey="prevCumulative" stroke={p.prev} strokeWidth={2} dot={false} name="Período anterior" />
          <Area type="monotone" dataKey="cumulative" stroke={p.brand} strokeWidth={2} fill={p.brand} fillOpacity={0.1} name="Período atual" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2">
        <Legend items={[{ label: "Período atual", color: p.brand }, { label: "Período anterior", color: p.prev }]} />
      </div>
    </div>
  )
}

// ── 2. Origens ao longo do tempo (empilhado) ─────────────────────────────────

function SourceTrendChart({ data, p, rangeLabel }: { data: ExecutiveData["sourceTrend"]; p: Palette; rangeLabel: string }) {
  const colorOf = (key: string, i: number) => (key === "__outros" ? p.outros : (p.cat[i % p.cat.length] ?? p.outros))
  const rows = data.periods.map((period, i) => {
    const row: Record<string, string | number> = { period }
    for (const s of data.series) row[s.key] = s.data[i] ?? 0
    return row
  })
  const ticks = thinTicks(data.periods)
  const labelOf = new Map(data.series.map((s) => [s.key, s.label]))

  return (
    <div className={CARD}>
      <h2 className={TITLE}>Origem dos Leads no Tempo</h2>
      <p className={`mb-3 ${SUBTITLE}`}>
        De onde os leads chegam, {data.granularity === "week" ? "semana a semana" : "dia a dia"} · {rangeLabel}
      </p>
      <div className="mb-3">
        <Legend items={data.series.map((s, i) => ({ label: s.label, color: colorOf(s.key, i) }))} />
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis
            dataKey="period"
            tickFormatter={formatDay}
            tick={{ fontSize: 11, fill: p.tick }}
            axisLine={false}
            tickLine={false}
            ticks={ticks}
          />
          <YAxis tick={{ fontSize: 11, fill: p.tick }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <Tooltip
            cursor={{ fill: p.grid, opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const total = payload.reduce((s, it) => s + ((it.value as number) ?? 0), 0)
              return (
                <TooltipBox>
                  <p className="mb-1 font-semibold text-gray-800 dark:text-stone-100">
                    {data.granularity === "week" ? "Semana de " : ""}{formatDay(String(label))} · {total} leads
                  </p>
                  {[...payload].reverse().map((it) =>
                    (it.value as number) > 0 ? (
                      <p key={String(it.dataKey)} className="flex items-center gap-1.5 text-gray-600 dark:text-stone-300">
                        <Swatch color={String(it.color)} />
                        {labelOf.get(String(it.dataKey))}: <span className="font-semibold">{it.value as number}</span>
                      </p>
                    ) : null
                  )}
                </TooltipBox>
              )
            }}
          />
          {data.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="origens"
              fill={colorOf(s.key, i)}
              stroke={p.surface}
              strokeWidth={1}
              maxBarSize={24}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── 3. Mapa de calor dia × hora ──────────────────────────────────────────────

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Seg..Dom

function HeatmapChart({ data, p, rangeLabel }: { data: ExecutiveData["heatmap"]; p: Palette; rangeLabel: string }) {
  // Recorta às horas com atividade, sempre mostrando ao menos o núcleo 8h–20h.
  let minH = 8
  let maxH = 20
  for (let h = 0; h < 24; h++) {
    if (data.grid.some((row) => (row[h] ?? 0) > 0)) {
      minH = Math.min(minH, h)
      maxH = Math.max(maxH, h)
    }
  }
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i)
  const ramp = p.heat
  const colorFor = (count: number) => {
    if (count <= 0 || data.max <= 0) return ramp[0]
    const idx = 1 + Math.min(ramp.length - 2, Math.floor((count / data.max) * (ramp.length - 2)))
    return ramp[idx]
  }

  return (
    <div className={CARD}>
      <h2 className={TITLE}>Quando os Leads Chegam</h2>
      <p className={`mb-4 ${SUBTITLE}`}>Entradas por dia da semana × hora (horário de Brasília) · {rangeLabel}</p>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {WEEKDAY_ORDER.map((wd) => (
            <div key={wd} className="mb-[2px] flex items-center gap-[2px]">
              <span className="w-9 shrink-0 text-right text-[11px] text-gray-400 dark:text-stone-500">{WEEKDAY_LABELS[wd]}</span>
              {hours.map((h) => {
                const count = data.grid[wd]?.[h] ?? 0
                return (
                  <div
                    key={h}
                    title={`${WEEKDAY_LABELS[wd]} ${h}h — ${count} lead${count === 1 ? "" : "s"}`}
                    className="h-6 flex-1 rounded-[3px] transition-transform hover:scale-110"
                    style={{ backgroundColor: colorFor(count) }}
                  />
                )
              })}
            </div>
          ))}
          <div className="mt-1 flex items-center gap-[2px]">
            <span className="w-9 shrink-0" />
            {hours.map((h) => (
              <span key={h} className="flex-1 text-center text-[10px] text-gray-400 dark:text-stone-500">
                {h % 3 === 0 ? `${h}h` : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400 dark:text-stone-500">
        <span>menos</span>
        <div className="flex gap-[2px]">
          {ramp.map((c) => (
            <span key={c} className="h-3 w-5 rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>mais</span>
        <span className="ml-auto">pico: {data.max} · total: {data.total}</span>
      </div>
    </div>
  )
}

// ── 4/5. Aproveitamento (100% empilhado) por origem / corretor ───────────────

const OUTCOME_SEGMENTS = [
  { key: "fechados", label: "Fechados" },
  { key: "ativos", label: "Em atendimento" },
  { key: "perdidos", label: "Perdidos" },
  // Fora do funil sem perda: classificação não-lead da roleta ou cliente da base (Épico 76).
  { key: "outros", label: "Não-lead/Cliente" },
] as const

function OutcomeBars({
  title,
  subtitle,
  rows,
  p,
  maxRows = 8,
}: {
  title: string
  subtitle: string
  rows: OutcomeRow[]
  p: Palette
  maxRows?: number
}) {
  const colorOf: Record<(typeof OUTCOME_SEGMENTS)[number]["key"], string> = {
    fechados: p.outcome.fechado,
    ativos: p.outcome.ativo,
    perdidos: p.outcome.perdido,
    outros: p.outcome.outro,
  }
  const shown = rows.slice(0, maxRows)
  const hiddenCount = rows.length - shown.length
  const hasInativos = shown.some((r) => r.outros > 0)
  const segments = OUTCOME_SEGMENTS.filter((s) => s.key !== "outros" || hasInativos)

  return (
    <div className={CARD}>
      <h2 className={TITLE}>{title}</h2>
      <p className={`mb-3 ${SUBTITLE}`}>{subtitle}</p>
      <div className="mb-4">
        <Legend items={segments.map((s) => ({ label: s.label, color: colorOf[s.key] }))} />
      </div>
      <div className="space-y-2.5">
        {shown.map((row) => (
          <div key={row.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-gray-600 dark:text-stone-300" title={row.label}>
              {row.label}
            </span>
            <div className="flex h-6 flex-1 gap-[2px] overflow-hidden rounded">
              {segments.map((s) => {
                const count = row[s.key]
                if (count === 0) return null
                const pct = (count / row.total) * 100
                return (
                  <div
                    key={s.key}
                    title={`${s.label}: ${count} de ${row.total} (${Math.round(pct)}%)`}
                    className="flex items-center justify-center rounded-[3px] text-[10px] font-semibold text-white"
                    style={{ width: `${pct}%`, backgroundColor: colorOf[s.key], minWidth: 3 }}
                  >
                    {pct >= 14 ? `${Math.round(pct)}%` : ""}
                  </div>
                )
              })}
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-stone-100">
              {row.total}
            </span>
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead no período.</p>}
        {hiddenCount > 0 && (
          <p className="pt-1 text-xs text-gray-400 dark:text-stone-500">+ {hiddenCount} com menos volume (fora do gráfico)</p>
        )}
      </div>
    </div>
  )
}

// ── 6. Visitas por período ───────────────────────────────────────────────────

const VISIT_SERIES = [
  { key: "realizadas", label: "Realizadas" },
  { key: "agendadas", label: "Agendadas" },
  { key: "noShow", label: "No-show" },
  { key: "canceladas", label: "Canceladas" },
] as const

function VisitsChart({ data, p, rangeLabel }: { data: ExecutiveData["visits"]; p: Palette; rangeLabel: string }) {
  const colorOf: Record<(typeof VISIT_SERIES)[number]["key"], string> = {
    realizadas: p.visits.realizada,
    agendadas: p.visits.agendada,
    noShow: p.visits.noShow,
    canceladas: p.visits.cancelada,
  }
  const rows = data.periods.map((period, i) => ({
    period,
    realizadas: data.realizadas[i] ?? 0,
    agendadas: data.agendadas[i] ?? 0,
    noShow: data.noShow[i] ?? 0,
    canceladas: data.canceladas[i] ?? 0,
  }))
  const ticks = thinTicks(data.periods)
  const total = data.totals.realizadas + data.totals.agendadas + data.totals.noShow + data.totals.canceladas

  return (
    <div className={CARD}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className={TITLE}>Visitas</h2>
        {data.totals.taxaNoShow != null && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              data.totals.taxaNoShow <= 20
                ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            }`}
          >
            {data.totals.taxaNoShow}% no-show
          </span>
        )}
      </div>
      <p className={`mb-3 ${SUBTITLE}`}>
        {data.totals.realizadas} realizadas de {total} no período, {data.granularity === "week" ? "por semana" : "por dia"} · {rangeLabel}
      </p>
      <div className="mb-3">
        <Legend items={VISIT_SERIES.map((s) => ({ label: s.label, color: colorOf[s.key] }))} />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis
            dataKey="period"
            tickFormatter={formatDay}
            tick={{ fontSize: 11, fill: p.tick }}
            axisLine={false}
            tickLine={false}
            ticks={ticks}
          />
          <YAxis tick={{ fontSize: 11, fill: p.tick }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <Tooltip
            cursor={{ fill: p.grid, opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const totalDay = payload.reduce((s, it) => s + ((it.value as number) ?? 0), 0)
              if (totalDay === 0) return null
              return (
                <TooltipBox>
                  <p className="mb-1 font-semibold text-gray-800 dark:text-stone-100">
                    {data.granularity === "week" ? "Semana de " : ""}{formatDay(String(label))}
                  </p>
                  {VISIT_SERIES.map((s) => {
                    const it = payload.find((x) => x.dataKey === s.key)
                    const v = (it?.value as number) ?? 0
                    return v > 0 ? (
                      <p key={s.key} className="flex items-center gap-1.5 text-gray-600 dark:text-stone-300">
                        <Swatch color={colorOf[s.key]} />
                        {s.label}: <span className="font-semibold">{v}</span>
                      </p>
                    ) : null
                  })}
                </TooltipBox>
              )
            }}
          />
          {VISIT_SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="visitas" fill={colorOf[s.key]} stroke={p.surface} strokeWidth={1} maxBarSize={24} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

interface Props {
  from: string
  to: string
  propertyId?: string
  rangeLabel: string
}

const emptySubscribe = () => () => {}

interface FetchResult {
  key: string
  data: ExecutiveData | null
  error: boolean
}

export function ExecutiveCharts({ from, to, propertyId, rangeLabel }: Props) {
  const { resolvedTheme } = useTheme()
  // Hidratação: false no servidor, true no cliente — sem setState em efeito.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  // loading/error são DERIVADOS da chave carregada — segura o render anterior
  // com opacidade reduzida durante o refetch (sem flash de skeleton).
  const [result, setResult] = useState<FetchResult | null>(null)

  const key = `${from}|${to}|${propertyId ?? ""}`

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ from, to })
    if (propertyId) params.set("property", propertyId)
    fetch(`/api/analytics/executive?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("API error")
        return res.json()
      })
      .then((json: ExecutiveData) => {
        if (!cancelled) setResult({ key: `${from}|${to}|${propertyId ?? ""}`, data: json, error: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: `${from}|${to}|${propertyId ?? ""}`, data: null, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [from, to, propertyId])

  const loading = result?.key !== key
  const data = result?.data ?? null
  const error = result?.key === key && result.error

  const p = mounted && resolvedTheme === "dark" ? DARK : LIGHT

  if (error) {
    return (
      <div className={`${CARD} text-sm text-gray-400 dark:text-stone-500`}>
        Não foi possível carregar a Visão Executiva. Recarregue a página.
      </div>
    )
  }

  if (!mounted || (loading && !data)) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${CARD} h-80 animate-pulse`} />
        ))}
      </div>
    )
  }
  if (!data) return null

  return (
    <div className={`relative space-y-6 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ComparisonChart data={data.comparison} p={p} rangeLabel={rangeLabel} />
        <SourceTrendChart data={data.sourceTrend} p={p} rangeLabel={rangeLabel} />
      </div>
      <HeatmapChart data={data.heatmap} p={p} rangeLabel={rangeLabel} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OutcomeBars
          title="Aproveitamento por Origem"
          subtitle="Desfecho dos leads de cada origem — barra completa = 100% das entradas"
          rows={data.outcomeBySource}
          p={p}
        />
        <OutcomeBars
          title="Aproveitamento por Corretor"
          subtitle="Desfecho dos leads de cada corretor ativo na roleta"
          rows={data.outcomeByBroker}
          p={p}
        />
      </div>
      <VisitsChart data={data.visits} p={p} rangeLabel={rangeLabel} />
    </div>
  )
}
