"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, CalendarClock, Wallet, type LucideIcon } from "lucide-react"
import { ServiceCard } from "./_components/service-card"
import { UpcomingReminders } from "./_components/upcoming-reminders"
import { MetaAdsSection } from "./_components/meta-ads-section"
import { type BillingPanelData, type ReminderRow, formatMoneyList } from "./_components/shared"

function SectionHeader({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Icon className="h-4 w-4 text-orange-600" />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {title}
      </h2>
      {meta && <div className="ml-auto text-xs text-stone-400 dark:text-stone-500">{meta}</div>}
    </div>
  )
}

export default function BillingPanelPage() {
  const router = useRouter()

  // Estado da chamada /api/admin/billing-panel (serviços + consolidado + meta ads).
  const [panel, setPanel] = useState<BillingPanelData | null>(null)
  const [panelError, setPanelError] = useState(false)
  const [loading, setLoading] = useState(true)

  // Estado da chamada /api/admin/billing-reminders (Story 78-8) — seção independente (AC8).
  const [reminders, setReminders] = useState<ReminderRow[] | null>(null)
  const [remindersError, setRemindersError] = useState(false)

  const [restricted, setRestricted] = useState(false)

  const fetchPanel = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/billing-panel")
      if (res.status === 401 || res.status === 403) {
        setRestricted(true)
        return
      }
      if (!res.ok) {
        setPanelError(true)
        return
      }
      const json = (await res.json()) as BillingPanelData
      setPanel(json)
      setPanelError(false)
    } catch {
      setPanelError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/billing-reminders")
      if (res.status === 401 || res.status === 403) {
        setRestricted(true)
        return
      }
      // 404 => rota da Story 78-8 ainda não implantada: trata como estado vazio (AC4/AC8).
      if (res.status === 404) {
        setReminders([])
        setRemindersError(false)
        return
      }
      if (!res.ok) {
        setRemindersError(true)
        return
      }
      const json = (await res.json()) as { data: ReminderRow[] }
      setReminders(json.data ?? [])
      setRemindersError(false)
    } catch {
      setRemindersError(true)
    }
  }, [])

  useEffect(() => {
    fetchPanel()
    fetchReminders()
    const interval = setInterval(() => {
      fetchPanel()
      fetchReminders()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchPanel, fetchReminders])

  useEffect(() => {
    if (restricted) {
      router.push("/dashboard")
    }
  }, [restricted, router])

  if (restricted) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">Acesso restrito a administradores</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Saúde &amp; Billing</h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Custo do mês, saúde de coleta e vencimentos por serviço — atualiza a cada 30s
        </p>
      </div>

      {/* Total consolidado do mês (exclui Meta Ads — AC5) */}
      <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <SectionHeader icon={Wallet} title="Total do mês (infraestrutura)" />
        {panelError ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Não foi possível carregar o consolidado.
          </p>
        ) : (
          <>
            <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              {panel && panel.consolidated_total.length > 0
                ? formatMoneyList(panel.consolidated_total)
                : "—"}
            </p>
            {(!panel || panel.consolidated_total.length === 0) && (
              <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                Sem coleta de custo ainda — os valores aparecem conforme os coletores rodam.
              </p>
            )}
            <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
              Não inclui budget de mídia do Meta Ads.
            </p>
          </>
        )}
      </div>

      {/* Cards de serviço (AC2/AC3/AC8) */}
      <div>
        <SectionHeader icon={Activity} title="Saúde dos serviços" />
        {panelError ? (
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
            Não foi possível carregar os serviços. Tente novamente em instantes.
          </div>
        ) : panel && panel.services.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {panel.services.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
            Nenhum serviço habilitado.
          </div>
        )}
      </div>

      {/* Próximos vencimentos (AC4 — consome API da Story 78-8) */}
      <div>
        <SectionHeader icon={CalendarClock} title="Próximos vencimentos" />
        <UpcomingReminders reminders={reminders} errored={remindersError} />
      </div>

      {/* Meta Ads — seção separada e condicional (AC6). Oculta quando meta_ads null/disabled. */}
      {panel?.meta_ads && <MetaAdsSection metaAds={panel.meta_ads} />}
    </div>
  )
}
