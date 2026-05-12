"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { EmailStatsCards } from "./_components/email-stats-cards"
import { EmailAlertsPanel, type EmailAlert } from "./_components/email-alerts-panel"
import { EmailLogsTable } from "./_components/email-logs-table"

interface Stats {
  sent_today: number
  delivered_today: number
  opened_today: number
  bounced_24h: number
  quota_limit: number
  delivery_rate: number
  open_rate: number
  bounce_rate_2h: number
  alerts: EmailAlert[]
}

export default function EmailMonitoringPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/email-stats")
    if (res.status === 403) {
      router.push("/dashboard")
      return
    }
    if (!res.ok) return
    const data = (await res.json()) as Stats
    setStats(data)
    setLoading(false)
  }, [router])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Central de Email</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            Monitoramento em tempo real — atualiza a cada 30s
          </p>
        </div>
      </div>

      <EmailStatsCards
        sentToday={stats.sent_today}
        quotaLimit={stats.quota_limit}
        deliveryRate={stats.delivery_rate}
        openRate={stats.open_rate}
        bounced24h={stats.bounced_24h}
      />

      <EmailAlertsPanel alerts={stats.alerts} />

      <EmailLogsTable />
    </div>
  )
}
