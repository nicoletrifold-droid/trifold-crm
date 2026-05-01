"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type {
  AssociatedLead,
  CampaignDetailApiResponse,
  ConversionFunnel,
  MetaAdSetWithMetrics,
  MetaInsightTimeSeries,
  RoasSummary,
} from "@trifold/shared"
import {
  formatBRL,
  formatBudget,
  formatDateTime,
  formatDayMonth,
  formatNumber,
  formatPercent,
  formatPeriod,
} from "@web/lib/meta-format"
import {
  LEAD_STATUS_BADGES,
  OBJECTIVE_LABELS,
  OPTIMIZATION_GOAL_LABELS,
  STATUS_BADGES,
} from "@web/lib/meta-constants"
import CampaignFunnel from "./campaign-funnel"

interface Props {
  campaignId: string
  isAdmin: boolean
}

type ErrorKind = "not_found" | "generic" | null

const PERIOD_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
]

// ─── Componente principal ──────────────────────────────────────────────────

export default function CampaignDetailClient({ campaignId }: Props) {
  const [data, setData] = useState<CampaignDetailApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorKind>(null)
  const [days, setDays] = useState<number>(30)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/meta-ads/campaigns/${encodeURIComponent(campaignId)}?days=${days}`,
        { cache: "no-store" },
      )
      if (res.status === 404) {
        setError("not_found")
        setData(null)
        return
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const json = (await res.json()) as CampaignDetailApiResponse
      setData(json)
    } catch {
      setError("generic")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [campaignId, days])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading && !data) {
    return <LoadingSkeleton />
  }

  // ─── Error 404 ───────────────────────────────────────────────────────────
  if (error === "not_found") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-white p-12 shadow-sm text-center">
        <p className="text-lg font-medium text-gray-700">
          Campanha não encontrada
        </p>
        <p className="mt-1 text-sm text-gray-500">
          A campanha pode ter sido removida ou pertencer a outra organização.
        </p>
        <Link
          href="/dashboard/campaigns/meta"
          className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Voltar para lista
        </Link>
      </div>
    )
  }

  // ─── Error generic ───────────────────────────────────────────────────────
  if (error === "generic" || !data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-red-50 p-12 text-center">
        <p className="text-lg font-medium text-red-700">
          Erro ao carregar campanha
        </p>
        <p className="mt-1 text-sm text-red-600">
          Verifique sua conexão e tente novamente.
        </p>
        <button
          onClick={() => void fetchData()}
          className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const { campaign, timeseries, adsets, funnel, leads, roas_summary } = data
  const statusBadge = STATUS_BADGES[campaign.status] ?? STATUS_BADGES.ARCHIVED
  const period = days === 7 ? "7d" : days === 90 ? "90d" : "30d"
  const objectiveLabel = campaign.objective
    ? (OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective)
    : null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          href="/dashboard/campaigns/meta"
          className="hover:text-orange-600"
        >
          Campanhas Meta
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">{campaign.name || "—"}</span>
      </nav>

      {/* Header */}
      <header className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {campaign.name || "Sem nome"}
              </h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="inline text-gray-500">Objetivo: </dt>
                <dd className="inline text-gray-900">
                  {objectiveLabel ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-gray-500">Orçamento: </dt>
                <dd className="inline text-gray-900">
                  {formatBudget(
                    campaign.daily_budget,
                    campaign.lifetime_budget,
                  )}
                </dd>
              </div>
              <div>
                <dt className="inline text-gray-500">Período: </dt>
                <dd className="inline text-gray-900">
                  {formatPeriod(campaign.start_time, campaign.stop_time)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Period selector */}
          <div
            className="inline-flex rounded-md border border-gray-300 bg-white p-0.5"
            role="group"
            aria-label="Selecionar período"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1 text-sm font-medium rounded ${
                  days === opt.value
                    ? "bg-orange-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Time series chart */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          Performance por Dia — últimos {days} dias
        </h2>
        <div className="mt-4">
          <TimeSeriesChart data={timeseries} />
        </div>
      </section>

      {/* Funil de Conversão (Story 19.2) */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          Funil de Conversão
        </h2>
        <div className="mt-4">
          <CampaignFunnel campaignId={campaignId} period={period} />
        </div>
      </section>

      {/* AdSets table */}
      <section className="rounded-lg bg-white shadow-sm">
        <header className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">AdSets</h2>
        </header>
        <AdsetsTable adsets={adsets} />
      </section>

      {/* Funnel */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          Funil de Conversão
        </h2>
        <div className="mt-4">
          <ConversionFunnelView funnel={funnel} />
        </div>
      </section>

      {/* ROAS */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          ROAS &amp; Conversão
        </h2>
        <div className="mt-4">
          <RoasCard roas={roas_summary} />
        </div>
      </section>

      {/* Leads table */}
      <section className="rounded-lg bg-white shadow-sm">
        <header className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Leads Associados
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Últimos {leads.length} leads vinculados a esta campanha via{" "}
            <code className="text-xs">utm_campaign</code>.
          </p>
        </header>
        <LeadsTable leads={leads} />
      </section>
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
      <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
    </div>
  )
}

// ─── Time series chart (SVG, sem dependências) ─────────────────────────────

interface TimeSeriesChartProps {
  data: MetaInsightTimeSeries[]
}

function TimeSeriesChart({ data }: TimeSeriesChartProps) {
  // Hooks MUST come before any early return (rules-of-hooks)
  const [hover, setHover] = useState<number | null>(null)

  const allZero = useMemo(
    () => data.every((d) => d.spend === 0 && d.leads_meta === 0),
    [data],
  )

  if (data.length === 0 || allZero) {
    return (
      <div className="flex h-64 items-center justify-center rounded border border-dashed border-gray-200 text-sm text-gray-500">
        Sem dados de performance no período selecionado
      </div>
    )
  }

  // Layout: 800x280 viewBox, padding for axes
  const W = 800
  const H = 280
  const padL = 60
  const padR = 60
  const padT = 16
  const padB = 40
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const maxSpend = Math.max(1, ...data.map((d) => d.spend))
  const maxLeads = Math.max(1, ...data.map((d) => d.leads_meta))

  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW
  const barWidth = data.length > 0 ? Math.max(2, innerW / data.length - 4) : 0

  const scaleY = (value: number, max: number) =>
    padT + innerH - (value / max) * innerH

  const scaleX = (i: number) =>
    data.length > 1 ? padL + i * stepX : padL + innerW / 2

  // Spend line path
  const linePath = data
    .map((d, i) => {
      const x = scaleX(i)
      const y = scaleY(d.spend, maxSpend)
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")

  // Y-axis ticks (5 levels)
  const yTicks = Array.from({ length: 5 }, (_, i) => i / 4)

  // X-axis tick interval (max ~10 labels)
  const xTickStep = Math.max(1, Math.ceil(data.length / 10))

  return (
    <div className="relative">
      {/* Legend */}
      <div className="mb-2 flex items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-blue-500" />
          Spend (R$)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-green-500" />
          Leads Meta
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico de performance por dia: spend (linha azul) e leads (barras verdes)"
      >
        {/* Grid + Y axis (left = spend) */}
        {yTicks.map((t, idx) => {
          const y = padT + innerH - t * innerH
          const value = t * maxSpend
          return (
            <g key={`y-${idx}`}>
              <line
                x1={padL}
                x2={padL + innerW}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-500"
                style={{ fontSize: 10 }}
              >
                {formatSpendAxis(value)}
              </text>
            </g>
          )
        })}

        {/* Y axis right = leads */}
        {yTicks.map((t, idx) => {
          const y = padT + innerH - t * innerH
          const value = t * maxLeads
          return (
            <text
              key={`yr-${idx}`}
              x={padL + innerW + 8}
              y={y + 4}
              textAnchor="start"
              className="fill-gray-500"
              style={{ fontSize: 10 }}
            >
              {Math.round(value)}
            </text>
          )
        })}

        {/* Bars (leads) */}
        {data.map((d, i) => {
          const x = scaleX(i) - barWidth / 2
          const y = scaleY(d.leads_meta, maxLeads)
          const h = padT + innerH - y
          if (d.leads_meta <= 0) return null
          return (
            <rect
              key={`bar-${d.date}`}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill="#22c55e"
              opacity={0.7}
            />
          )
        })}

        {/* Spend line */}
        <path
          d={linePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />

        {/* Spend dots */}
        {data.map((d, i) => (
          <circle
            key={`dot-${d.date}`}
            cx={scaleX(i)}
            cy={scaleY(d.spend, maxSpend)}
            r={2.5}
            fill="#3b82f6"
          />
        ))}

        {/* X axis labels */}
        {data.map((d, i) => {
          if (i % xTickStep !== 0 && i !== data.length - 1) return null
          return (
            <text
              key={`x-${d.date}`}
              x={scaleX(i)}
              y={H - padB / 2 + 4}
              textAnchor="middle"
              className="fill-gray-500"
              style={{ fontSize: 10 }}
            >
              {formatDayMonth(d.date)}
            </text>
          )
        })}

        {/* Hover overlay (transparent rects per data point) */}
        {data.map((d, i) => {
          const cx = scaleX(i)
          const halfStep = data.length > 1 ? stepX / 2 : innerW / 2
          return (
            <rect
              key={`hover-${d.date}`}
              x={cx - halfStep}
              y={padT}
              width={halfStep * 2}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((prev) => (prev === i ? null : prev))}
            />
          )
        })}

        {/* Hover line */}
        {hover !== null && (
          <line
            x1={scaleX(hover)}
            x2={scaleX(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke="#9ca3af"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-2 right-2 rounded border border-gray-200 bg-white p-3 text-sm shadow">
          <p className="font-medium text-gray-900">
            {formatDayMonth(data[hover].date)}
          </p>
          <p className="text-blue-600">
            Spend: {formatBRL(data[hover].spend)}
          </p>
          <p className="text-green-600">Leads: {data[hover].leads_meta}</p>
        </div>
      )}
    </div>
  )
}

function formatSpendAxis(value: number): string {
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`
  return `R$ ${Math.round(value)}`
}

// ─── AdSets table ──────────────────────────────────────────────────────────

function AdsetsTable({ adsets }: { adsets: MetaAdSetWithMetrics[] }) {
  if (adsets.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-gray-500">
        Nenhum AdSet encontrado para esta campanha
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <Th align="left">AdSet</Th>
            <Th align="left">Status</Th>
            <Th align="left">Objetivo</Th>
            <Th align="right">Orçamento</Th>
            <Th align="right">Spend</Th>
            <Th align="right">Impressões</Th>
            <Th align="right">Cliques</Th>
            <Th align="right">CTR</Th>
            <Th align="right">Leads</Th>
            <Th align="right">CPL</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {adsets.map((a) => {
            const badge = STATUS_BADGES[a.status] ?? STATUS_BADGES.ARCHIVED
            const goalLabel = a.optimization_goal
              ? (OPTIMIZATION_GOAL_LABELS[a.optimization_goal] ??
                a.optimization_goal)
              : "—"
            return (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {a.name || "Sem nome"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {goalLabel}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {formatBudget(a.daily_budget, null)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {formatBRL(a.spend)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {formatNumber(a.impressions)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {formatNumber(a.clicks)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {formatPercent(a.ctr)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {a.leads_meta}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {a.cpl !== null ? formatBRL(a.cpl) : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode
  align: "left" | "right"
}) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-medium uppercase tracking-wide text-gray-500`}
    >
      {children}
    </th>
  )
}

// ─── Conversion funnel ─────────────────────────────────────────────────────

function ConversionFunnelView({ funnel }: { funnel: ConversionFunnel }) {
  const stages: Array<{
    key: keyof ConversionFunnel
    label: string
    value: number
    prev: number | null
  }> = [
    {
      key: "leads_meta",
      label: "Leads Meta",
      value: funnel.leads_meta,
      prev: null,
    },
    {
      key: "leads_crm",
      label: "Leads CRM",
      value: funnel.leads_crm,
      prev: funnel.leads_meta,
    },
    {
      key: "leads_qualified",
      label: "Qualificados",
      value: funnel.leads_qualified,
      prev: funnel.leads_crm,
    },
    {
      key: "visits_scheduled",
      label: "Visitas Agendadas",
      value: funnel.visits_scheduled,
      prev: funnel.leads_qualified,
    },
    {
      key: "sales",
      label: "Vendas",
      value: funnel.sales,
      prev: funnel.visits_scheduled,
    },
  ]

  const formatRate = (current: number, prev: number | null): string => {
    if (prev === null) return ""
    if (prev === 0) return "—"
    const rate = (current / prev) * 100
    return `${rate.toFixed(1).replace(".", ",")}%`
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {stages.map((stage, i) => {
        const rate = formatRate(stage.value, stage.prev)
        return (
          <div key={stage.key} className="relative">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {stage.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatNumber(stage.value)}
              </p>
              {stage.prev !== null && (
                <p className="mt-1 text-xs text-gray-500">
                  {rate === "—" ? "—" : `Conversão: ${rate}`}
                </p>
              )}
            </div>
            {i < stages.length - 1 && (
              <div
                className="hidden md:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10 text-gray-400"
                aria-hidden="true"
              >
                <span className="text-xl">›</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── ROAS card ─────────────────────────────────────────────────────────────

function RoasCard({ roas }: { roas: RoasSummary | null }) {
  if (roas === null) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        ROAS disponível após configurar vendas (Story 16.10)
      </div>
    )
  }

  const roasColor =
    roas.roas === null
      ? "text-gray-700"
      : roas.roas >= 3
        ? "text-green-700"
        : roas.roas >= 1
          ? "text-yellow-700"
          : "text-red-700"

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <RoasMetric label="Total Gasto" value={formatBRL(roas.total_spend)} />
      <RoasMetric label="Leads CRM" value={formatNumber(roas.leads_in_crm)} />
      <RoasMetric
        label="CPL Real"
        value={roas.cpl_real !== null ? formatBRL(roas.cpl_real) : "—"}
      />
      <RoasMetric label="Vendas" value={formatNumber(roas.sales_count)} />
      <RoasMetric
        label="Receita Total"
        value={formatBRL(roas.total_revenue)}
      />
      <RoasMetric
        label="ROAS"
        value={
          roas.roas !== null
            ? roas.roas.toFixed(2).replace(".", ",")
            : "—"
        }
        valueClassName={roasColor}
      />
    </div>
  )
}

function RoasMetric({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${valueClassName ?? "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Leads table ───────────────────────────────────────────────────────────

function LeadsTable({ leads }: { leads: AssociatedLead[] }) {
  if (leads.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-gray-500">
        Nenhum lead associado a esta campanha encontrado no CRM
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <Th align="left">Nome</Th>
            <Th align="left">Telefone</Th>
            <Th align="left">Status</Th>
            <Th align="left">Origem</Th>
            <Th align="left">UTM Campaign</Th>
            <Th align="left">Data</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {leads.map((lead) => {
            const badge =
              LEAD_STATUS_BADGES[lead.status] ??
              ({ label: lead.status || "—", className: "bg-gray-100 text-gray-600" } as const)
            return (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <Link
                    href={`/dashboard/leads/${lead.id}`}
                    className="font-medium text-orange-600 hover:text-orange-800"
                  >
                    {lead.name || "Sem nome"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {lead.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {lead.source || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {lead.utm_campaign ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {formatDateTime(lead.created_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
