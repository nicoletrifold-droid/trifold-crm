"use client"

import { useEffect, useState } from "react"

interface AlertRow {
  id: string
  alert_type: string
  level: string
  entity_id: string
  severity: "info" | "warning" | "critical"
  message: string
  is_read: boolean
  fired_date: string
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  warning:  "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300",
  info:     "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
}

const SEVERITY_ICON: Record<string, string> = {
  critical: "🚨",
  warning:  "⚠️",
  info:     "💡",
}

const TYPE_LABELS: Record<string, string> = {
  cpl_spike:            "CPL Disparou",
  zero_leads_active:    "Sem Leads",
  scale_candidate:      "Candidata a Escalar",
  frequency_saturation: "Frequência Alta",
  creative_fatigue:     "Fadiga de Criativo",
  budget_underdelivery: "Budget Subutilizado",
  token_invalid:        "Token Inválido",
}

interface Props { campaignId: string }

export default function CampaignAlertsPanel({ campaignId }: Props) {
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetch(`/api/meta-ads/campaigns/${encodeURIComponent(campaignId)}/alerts-meta?days=30`)
      .then((r) => r.json())
      .then((d: { alerts?: AlertRow[] }) => setAlerts(d.alerts ?? []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [campaignId])

  if (loading) return null

  const unread = alerts.filter((a) => !a.is_read)
  if (unread.length === 0) return null

  return (
    <div className="space-y-2">
      {unread.map((alert) => (
        <div
          key={alert.id}
          className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info}`}
        >
          <span className="shrink-0 text-base">{SEVERITY_ICON[alert.severity]}</span>
          <div className="min-w-0">
            <span className="font-medium">{TYPE_LABELS[alert.alert_type] ?? alert.alert_type}</span>
            <span className="mx-1 text-xs opacity-60">·</span>
            <span className="text-xs opacity-60">{alert.fired_date}</span>
            <p className="mt-0.5 opacity-90">{alert.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
