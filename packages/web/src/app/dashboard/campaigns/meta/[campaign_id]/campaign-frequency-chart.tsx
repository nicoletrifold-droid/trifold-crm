"use client"

import type { MetaInsightTimeSeries } from "@trifold/shared"
import { formatDayMonth } from "@web/lib/meta-format"

interface Props {
  timeseries: MetaInsightTimeSeries[]
}

const SATURATE_THRESHOLD = 2.8
const WARN_THRESHOLD     = 2.0

export default function CampaignFrequencyChart({ timeseries }: Props) {
  const data = timeseries.filter((r) => r.frequency > 0)

  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">Sem dados de frequência para este período.</p>
    )
  }

  const avgFreq  = data.reduce((s, r) => s + r.frequency, 0) / data.length
  const maxFreq  = Math.max(SATURATE_THRESHOLD + 0.5, ...data.map((r) => r.frequency))
  const latestFreq = data[data.length - 1]?.frequency ?? 0

  const W = 800; const H = 200
  const padL = 40; const padR = 16; const padT = 16; const padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const scaleX = (i: number) => padL + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2)
  const scaleY = (v: number) => padT + innerH - (v / maxFreq) * innerH

  const linePath = data
    .map((r, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(r.frequency).toFixed(1)}`)
    .join(" ")

  const xTickStep = Math.max(1, Math.ceil(data.length / 8))

  const freqColor =
    latestFreq >= SATURATE_THRESHOLD ? "text-red-600 dark:text-red-400" :
    latestFreq >= WARN_THRESHOLD     ? "text-yellow-600 dark:text-yellow-400" :
                                       "text-green-600 dark:text-green-400"

  return (
    <div className="space-y-2">
      {/* Current value badge */}
      <div className="flex items-center gap-4 text-sm">
        <span className={`font-semibold ${freqColor}`}>
          Frequência atual: {latestFreq.toFixed(2)}×
        </span>
        <span className="text-gray-500 dark:text-stone-400">
          Média do período: {avgFreq.toFixed(2)}×
        </span>
        <span className="flex items-center gap-1.5 text-gray-400 dark:text-stone-500 text-xs">
          <span className="inline-block h-2 w-3 rounded-sm bg-yellow-300" /> Atenção &gt;{WARN_THRESHOLD}
          <span className="ml-2 inline-block h-2 w-3 rounded-sm bg-red-400" /> Saturação &gt;{SATURATE_THRESHOLD}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Frequência média diária ao longo do período"
      >
        {/* Saturate zone */}
        <rect
          x={padL} y={scaleY(maxFreq)}
          width={innerW} height={scaleY(SATURATE_THRESHOLD) - scaleY(maxFreq)}
          fill="#fca5a5" opacity={0.2}
        />
        {/* Warn zone */}
        <rect
          x={padL} y={scaleY(SATURATE_THRESHOLD)}
          width={innerW} height={scaleY(WARN_THRESHOLD) - scaleY(SATURATE_THRESHOLD)}
          fill="#fde68a" opacity={0.2}
        />

        {/* Threshold lines */}
        <line x1={padL} x2={padL + innerW} y1={scaleY(SATURATE_THRESHOLD)} y2={scaleY(SATURATE_THRESHOLD)} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
        <line x1={padL} x2={padL + innerW} y1={scaleY(WARN_THRESHOLD)}     y2={scaleY(WARN_THRESHOLD)}     stroke="#eab308" strokeDasharray="4 3" strokeWidth={1} />

        {/* Avg dashed line */}
        <line x1={padL} x2={padL + innerW} y1={scaleY(avgFreq)} y2={scaleY(avgFreq)} stroke="#6b7280" strokeDasharray="2 4" strokeWidth={1} />

        {/* Y axis labels */}
        {[0, WARN_THRESHOLD, SATURATE_THRESHOLD, maxFreq].map((v) => (
          <text key={v} x={padL - 6} y={scaleY(v) + 4} textAnchor="end" style={{ fontSize: 10 }} className="fill-gray-400">
            {v.toFixed(1)}
          </text>
        ))}

        {/* Frequency line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />

        {/* Dots */}
        {data.map((r, i) => {
          const dotColor = r.frequency >= SATURATE_THRESHOLD ? "#ef4444" : r.frequency >= WARN_THRESHOLD ? "#eab308" : "#3b82f6"
          return (
            <circle key={r.date} cx={scaleX(i)} cy={scaleY(r.frequency)} r={3} fill={dotColor} />
          )
        })}

        {/* X labels */}
        {data.map((r, i) => {
          if (i % xTickStep !== 0 && i !== data.length - 1) return null
          return (
            <text key={r.date} x={scaleX(i)} y={H - padB / 3} textAnchor="middle" style={{ fontSize: 10 }} className="fill-gray-400">
              {formatDayMonth(r.date)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
