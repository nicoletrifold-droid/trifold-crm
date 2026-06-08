"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import AgentChatPanel from "@web/components/agent/agent-chat-panel"

interface CampaignMetrics {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpl: number | null
  leads_meta: number
  leads_responderam: number
  leads_qualificados: number
  cpl_real: number | null
  taxa_qualificacao: number | null
  spend_yesterday: number
  utilization_rate: number | null
}

interface CampaignWithMetrics {
  id: string
  meta_campaign_id: string
  name: string
  objective: string | null
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED"
  daily_budget: number | null
  lifetime_budget: number | null
  metrics: CampaignMetrics
  leads_crm: number
  active_alert_types: string[]
}

// ─── Health score ──────────────────────────────────────────────────────────

function calcHealthScore(c: CampaignWithMetrics): number {
  let score = 100
  const alerts = c.active_alert_types
  if (alerts.includes("cpl_spike"))            score -= 30
  if (alerts.includes("zero_leads_active"))    score -= 25
  if (alerts.includes("frequency_saturation")) score -= 15
  if (alerts.includes("budget_underdelivery")) score -= 10
  if (alerts.includes("creative_fatigue"))     score -= 10
  if (alerts.includes("scale_candidate"))      score += 10
  return Math.max(0, Math.min(100, score))
}

function HealthBadge({ score }: { score: number }) {
  const [bg, text] =
    score >= 80 ? ["bg-green-100 dark:bg-green-500/15", "text-green-700 dark:text-green-300"] :
    score >= 50 ? ["bg-yellow-100 dark:bg-yellow-500/15", "text-yellow-700 dark:text-yellow-300"] :
                  ["bg-red-100 dark:bg-red-500/15", "text-red-700 dark:text-red-300"]
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${bg} ${text}`} title="Score de saúde da campanha">
      {score}
    </span>
  )
}

function BudgetPacingBar({ utilization }: { utilization: number | null }) {
  if (utilization === null) return <span className="text-gray-300 dark:text-stone-600 text-xs">—</span>
  const clampedPct = Math.min(100, Math.max(0, utilization))
  const [barColor] =
    clampedPct >= 70 ? ["bg-green-400"] :
    clampedPct >= 50 ? ["bg-yellow-400"] :
                       ["bg-red-400"]
  return (
    <div className="flex flex-col items-end gap-0.5" title={`${utilization}% do budget diário consumido ontem`}>
      <span className="text-xs text-gray-500 dark:text-stone-400">{utilization}%</span>
      <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-stone-700">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${clampedPct}%` }} />
      </div>
    </div>
  )
}

interface SyncStatus {
  started_at: string
  status: "running" | "success" | "error"
  records_synced: number
}

interface ApiResponse {
  campaigns: CampaignWithMetrics[]
  last_sync: SyncStatus | null
}

// ─── Formatação ────────────────────────────────────────────────────────────

const formatBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

const formatBudget = (daily: number | null, lifetime: number | null): string => {
  if (daily) return `${formatBRL(daily / 100)}/dia`
  if (lifetime) return `${formatBRL(lifetime / 100)} total`
  return "—"
}

const formatNumber = (n: number): string => new Intl.NumberFormat("pt-BR").format(n)

const formatPercent = (n: number): string => `${n.toFixed(2).replace(".", ",")}%`

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

function formatQualificacaoBadge(taxa: number | null): React.ReactElement {
  if (taxa === null) return <span className="text-gray-400 dark:text-stone-500">—</span>
  const color =
    taxa >= 40
      ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
      : taxa >= 20
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
        : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {taxa.toFixed(1).replace(".", ",")}%
    </span>
  )
}

// ─── Constantes ────────────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ACTIVE:   { label: "Ativa",     className: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  PAUSED:   { label: "Pausada",   className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300" },
  ARCHIVED: { label: "Arquivada", className: "bg-gray-100 text-gray-600 dark:bg-stone-700/50 dark:text-stone-300" },
  DELETED:  { label: "Deletada",  className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
}

const SYNC_BADGES: Record<string, { label: string; className: string }> = {
  success: { label: "Concluída", className: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  error:   { label: "Erro",      className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  running: { label: "Em andamento", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300" },
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS:         "Geração de Leads",
  OUTCOME_TRAFFIC:       "Tráfego",
  OUTCOME_AWARENESS:     "Reconhecimento",
  OUTCOME_ENGAGEMENT:    "Engajamento",
  OUTCOME_APP_PROMOTION: "Promoção de App",
  OUTCOME_SALES:         "Vendas",
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

function CampaignsTabs({ active }: { active: "crm" | "meta" }) {
  return (
    <div className="flex border-b border-gray-200 mb-4 dark:border-stone-800">
      <Link
        href="/dashboard/campaigns"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "crm"
            ? "border-orange-600 text-orange-600 dark:text-orange-300"
            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-700"
        }`}
      >
        CRM
      </Link>
      <Link
        href="/dashboard/campaigns/meta"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "meta"
            ? "border-orange-600 text-orange-600 dark:text-orange-300"
            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-700"
        }`}
      >
        Meta Ads
      </Link>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

type HealthFilter = "ALL" | "alerts" | "risk" | "scale"

export default function CampaignsMetaClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("ALL")
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/meta-ads/campaigns?period=${period}&status=${statusFilter}`
      )
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar campanhas")
    } finally {
      setLoading(false)
    }
  }, [period, statusFilter])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch("/api/meta-ads/sync", { method: "POST" })
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      setSyncMessage({ type: "success", text: "Sincronização iniciada" })
      setTimeout(() => setSyncMessage(null), 4000)
    } catch {
      setSyncMessage({ type: "error", text: "Erro ao iniciar sincronização" })
      setTimeout(() => setSyncMessage(null), 4000)
    } finally {
      setSyncing(false)
    }
  }

  const lastSync = data?.last_sync ?? null
  const syncBadge = lastSync ? (SYNC_BADGES[lastSync.status] ?? SYNC_BADGES.success) : null

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Campanhas</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Performance de campanhas Meta Ads sincronizadas
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Última sincronização */}
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-stone-400">
            {lastSync ? (
              <>
                <span>Última sync: {formatDate(lastSync.started_at)}</span>
                {syncBadge && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${syncBadge.className}`}>
                    {syncBadge.label}
                  </span>
                )}
              </>
            ) : (
              <span>Nunca sincronizado</span>
            )}
          </div>

          {/* Botão de sync (admin only) */}
          {isAdmin && (
            <button
              onClick={() => void handleSync()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {syncing && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Sincronizar agora
            </button>
          )}

          {/* Feedback de sync */}
          {syncMessage && (
            <p className={`text-xs font-medium ${syncMessage.type === "success" ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-300"}`}>
              {syncMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <CampaignsTabs active="meta" />

      {/* Filtros de saúde — B-5 */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "alerts", "risk", "scale"] as HealthFilter[]).map((f) => {
          const labels: Record<HealthFilter, string> = {
            ALL: "Todas", alerts: "Com alertas", risk: "Em risco", scale: "Candidatas a escalar",
          }
          return (
            <button
              key={f}
              onClick={() => setHealthFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                healthFilter === f
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              }`}
            >
              {labels[f]}
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="ALL">Todos os status</option>
          <option value="ACTIVE">Ativa</option>
          <option value="PAUSED">Pausada</option>
        </select>
      </div>

      {/* Estados */}
      {loading && (
        <div className="flex items-center justify-center rounded-lg bg-white p-12 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <svg className="h-6 w-6 animate-spin text-gray-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</div>
      )}

      {!loading && !error && data?.campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg bg-white p-12 shadow-sm text-center dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          {!lastSync ? (
            <>
              <p className="text-lg font-medium text-gray-600 dark:text-stone-300">Integração Meta Ads não configurada</p>
              <p className="mt-1 text-sm text-gray-400 dark:text-stone-500">Configure a integração para começar a sincronizar campanhas</p>
              <Link
                href="/dashboard/configuracoes/integracoes/meta-ads"
                className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Configurar integração
              </Link>
            </>
          ) : (
            <p className="text-lg font-medium text-gray-600 dark:text-stone-300">
              Nenhuma campanha encontrada para o período selecionado
            </p>
          )}
        </div>
      )}

      {/* Tabela */}
      {!loading && !error && (data?.campaigns.length ?? 0) > 0 && (
        <ScrollableX className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead className="bg-gray-50 dark:bg-stone-800/50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400" title="Score de saúde">
                  Saúde
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Campanha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Orçamento
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Spend
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Impressões
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Cliques
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  CTR
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  CPL
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Leads Meta
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Leads CRM
                </th>
                <th
                  title="Custo por lead que respondeu o bot (spend ÷ leads que interagiram)"
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 cursor-help dark:text-stone-400"
                >
                  CPL Real
                </th>
                <th
                  title="% de leads Meta que foram qualificados pela Nicole"
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 cursor-help dark:text-stone-400"
                >
                  Qualificação
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400" title="% do budget diário consumido ontem">
                  Pacing
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-stone-400">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {(data?.campaigns ?? [])
                .filter((c) => {
                  if (healthFilter === "ALL") return true
                  const alerts = c.active_alert_types ?? []
                  if (healthFilter === "alerts") return alerts.length > 0
                  if (healthFilter === "risk") return alerts.some((a) => ["cpl_spike","zero_leads_active","frequency_saturation"].includes(a))
                  if (healthFilter === "scale") return alerts.includes("scale_candidate")
                  return true
                })
                .map((c) => {
                const badge = STATUS_BADGES[c.status] ?? STATUS_BADGES.ARCHIVED!
                const objective = c.objective
                  ? (OBJECTIVE_LABELS[c.objective] ?? c.objective)
                  : null
                const healthScore = calcHealthScore(c)

                return (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                    <td className="px-4 py-3 text-center">
                      <HealthBadge score={healthScore} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-stone-100">{c.name}</p>
                      {objective && (
                        <p className="text-xs text-gray-500 dark:text-stone-400">{objective}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                      {formatBudget(c.daily_budget, c.lifetime_budget)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">
                      {formatBRL(c.metrics.spend)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                      {formatNumber(c.metrics.impressions)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                      {formatNumber(c.metrics.clicks)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                      {formatPercent(c.metrics.ctr)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300">
                      {c.metrics.cpl !== null ? formatBRL(c.metrics.cpl) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">
                      {c.metrics.leads_meta}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">
                      <Link
                        href={`/dashboard/leads?utm_campaign=${encodeURIComponent(c.name)}`}
                        className="text-orange-600 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
                      >
                        {c.leads_crm}
                      </Link>
                    </td>
                    <td
                      title="Custo por lead que respondeu o bot (spend ÷ leads que interagiram)"
                      className="px-4 py-3 text-right text-sm text-gray-700 dark:text-stone-300"
                    >
                      {c.metrics.cpl_real !== null ? formatBRL(c.metrics.cpl_real) : "—"}
                    </td>
                    <td
                      title="% de leads Meta que foram qualificados pela Nicole"
                      className="px-4 py-3 text-right text-sm"
                    >
                      {formatQualificacaoBadge(c.metrics.taxa_qualificacao)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BudgetPacingBar utilization={c.metrics.utilization_rate ?? null} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Link
                        href={`/dashboard/campaigns/meta/${c.meta_campaign_id}`}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                      >
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollableX>
      )}

      {/* Agent chat panel — D-1 through D-5 */}
      <AgentChatPanel isAdmin={isAdmin} contextType="global" />
    </div>
  )
}
