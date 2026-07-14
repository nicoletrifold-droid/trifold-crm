"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, CalendarClock, Wallet } from "lucide-react"
import { ServiceCard } from "./_components/service-card"
import { UpcomingReminders } from "./_components/upcoming-reminders"
import { MetaAdsSection } from "./_components/meta-ads-section"
import { FixedSubscriptions } from "./_components/fixed-subscriptions"
import { SectionHeader } from "./_components/section-header"
import { type BillingPanelData, type ReminderRow, formatMoneyList } from "./_components/shared"

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

  // Story 78-15 (AC5/T7.2): merge local pós-PATCH — atualiza a linha por `id` sem esperar o
  // próximo ciclo de polling (30s), para o card refletir a edição (e o CTA sumir) imediatamente.
  const handleReminderUpdated = useCallback((updated: ReminderRow) => {
    setReminders((prev) =>
      prev ? prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) : prev
    )
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
        ) : panel && panel.services.filter((s) => s.slug !== "claude_team").length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {/* Story 78-15 (AC8): `claude_team` fora do grid de custo de USO — nunca terá coleta
               automática (has_auto_cost_collection=false), viraria card "Sem dado" eterno. Ele só
               aparece na seção "Assinaturas Fixas". Filtro client-side (não toca billing-panel/route.ts). */}
            {panel.services
              .filter((service) => service.slug !== "claude_team")
              .map((service) => (
                <ServiceCard key={service.slug} service={service} />
              ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
            Nenhum serviço habilitado.
          </div>
        )}
      </div>

      {/* Assinaturas Fixas (Story 78-15 — reusa os 2 fetches já feitos; PATCH via merge local) */}
      <FixedSubscriptions
        reminders={reminders}
        panelServices={panel?.services ?? []}
        errored={remindersError}
        onUpdated={handleReminderUpdated}
      />

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
