"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

interface CampaignMetrics {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpl: number | null
  leads_meta: number
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

// ─── Constantes ────────────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ACTIVE:   { label: "Ativa",     className: "bg-green-100 text-green-700" },
  PAUSED:   { label: "Pausada",   className: "bg-yellow-100 text-yellow-700" },
  ARCHIVED: { label: "Arquivada", className: "bg-gray-100 text-gray-600" },
  DELETED:  { label: "Deletada",  className: "bg-red-100 text-red-700" },
}

const SYNC_BADGES: Record<string, { label: string; className: string }> = {
  success: { label: "Concluída", className: "bg-green-100 text-green-700" },
  error:   { label: "Erro",      className: "bg-red-100 text-red-700" },
  running: { label: "Em andamento", className: "bg-yellow-100 text-yellow-700" },
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
    <div className="flex border-b border-gray-200 mb-4">
      <Link
        href="/dashboard/campaigns"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "crm"
            ? "border-orange-600 text-orange-600"
            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
        }`}
      >
        CRM
      </Link>
      <Link
        href="/dashboard/campaigns/meta"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === "meta"
            ? "border-orange-600 text-orange-600"
            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
        }`}
      >
        Meta Ads
      </Link>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function CampaignsMetaClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const [statusFilter, setStatusFilter] = useState("ALL")
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
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Performance de campanhas Meta Ads sincronizadas
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Última sincronização */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
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
            <p className={`text-xs font-medium ${syncMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {syncMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <CampaignsTabs active="meta" />

      {/* Filtros */}
      <div className="flex gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-500 focus:outline-none"
        >
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-500 focus:outline-none"
        >
          <option value="ALL">Todos os status</option>
          <option value="ACTIVE">Ativa</option>
          <option value="PAUSED">Pausada</option>
        </select>
      </div>

      {/* Estados */}
      {loading && (
        <div className="flex items-center justify-center rounded-lg bg-white p-12 shadow-sm">
          <svg className="h-6 w-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && data?.campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg bg-white p-12 shadow-sm text-center">
          {!lastSync ? (
            <>
              <p className="text-lg font-medium text-gray-600">Integração Meta Ads não configurada</p>
              <p className="mt-1 text-sm text-gray-400">Configure a integração para começar a sincronizar campanhas</p>
              <Link
                href="/dashboard/configuracoes/integracoes/meta-ads"
                className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Configurar integração
              </Link>
            </>
          ) : (
            <p className="text-lg font-medium text-gray-600">
              Nenhuma campanha encontrada para o período selecionado
            </p>
          )}
        </div>
      )}

      {/* Tabela */}
      {!loading && !error && (data?.campaigns.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Campanha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Orçamento
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Spend
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Impressões
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Cliques
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  CTR
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  CPL
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Leads Meta
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Leads CRM
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.campaigns.map((c) => {
                const badge = STATUS_BADGES[c.status] ?? STATUS_BADGES.ARCHIVED
                const objective = c.objective
                  ? (OBJECTIVE_LABELS[c.objective] ?? c.objective)
                  : null

                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      {objective && (
                        <p className="text-xs text-gray-500">{objective}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {formatBudget(c.daily_budget, c.lifetime_budget)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {formatBRL(c.metrics.spend)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {formatNumber(c.metrics.impressions)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {formatNumber(c.metrics.clicks)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {formatPercent(c.metrics.ctr)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {c.metrics.cpl !== null ? formatBRL(c.metrics.cpl) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {c.metrics.leads_meta}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      <Link
                        href={`/dashboard/leads?utm_campaign=${encodeURIComponent(c.name)}`}
                        className="text-orange-600 hover:text-orange-800"
                      >
                        {c.leads_crm}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Link
                        href={`/dashboard/campaigns/meta/${c.meta_campaign_id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
