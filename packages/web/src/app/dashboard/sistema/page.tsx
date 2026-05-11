"use client"

import Link from "next/link"
import { useEffect, useState, useCallback } from "react"
import { Mail, LayoutTemplate, Zap, Send } from "lucide-react"

interface SystemEvent {
  id: string
  level: "error" | "warn" | "info"
  category: string
  event_type: string
  message: string
  metadata: Record<string, unknown>
  source: string | null
  request_id: string | null
  created_at: string
}

interface Metrics {
  errors_24h: number
  messages_24h: number
  avg_claude_response_ms: number | null
  rag_fallback_rate: number
}

type HealthStatus = "green" | "yellow" | "red"

interface SystemData {
  data: SystemEvent[]
  metrics: Metrics
  health: Record<string, HealthStatus>
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  error: { bg: "bg-red-50", text: "text-red-700", label: "Erro" },
  warn: { bg: "bg-amber-50", text: "text-amber-700", label: "Aviso" },
  info: { bg: "bg-blue-50", text: "text-blue-700", label: "Info" },
}

const HEALTH_STYLES: Record<HealthStatus, { bg: string; dot: string; label: string }> = {
  green: { bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", label: "Saudavel" },
  yellow: { bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500", label: "Atencao" },
  red: { bg: "bg-red-50 border-red-200", dot: "bg-red-500", label: "Critico" },
}

const CATEGORY_LABELS: Record<string, string> = {
  bot: "Bot",
  ai: "AI / Claude",
  webhook: "Webhooks",
  cron: "Cron Jobs",
}

export default function SistemaPage() {
  const [data, setData] = useState<SystemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterLevel, setFilterLevel] = useState<string>("")
  const [filterCategory, setFilterCategory] = useState<string>("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterLevel) params.set("level", filterLevel)
      if (filterCategory) params.set("category", filterCategory)

      const res = await fetch(`/api/system-events?${params.toString()}`)
      if (res.status === 403) {
        setError("Acesso restrito a administradores")
        return
      }
      if (!res.ok) throw new Error("Erro ao carregar dados")

      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }, [filterLevel, filterCategory])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">{error}</p>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-stone-900">Sistema</h1>

      {/* Email Marketing hub */}
      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
          <Mail className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-medium text-stone-700">Email Marketing</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-stone-100 lg:grid-cols-4">
          {[
            { href: "/dashboard/sistema/emails", icon: Mail, label: "Monitoramento", desc: "Status e métricas" },
            { href: "/dashboard/sistema/email-templates", icon: LayoutTemplate, label: "Templates", desc: "Criar e editar" },
            { href: "/dashboard/sistema/email-automacoes", icon: Zap, label: "Automações", desc: "Triggers de envio" },
            { href: "/dashboard/sistema/email-blasts", icon: Send, label: "Disparos", desc: "Email em massa" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-1 bg-white px-4 py-3 transition-colors hover:bg-orange-50"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-sm font-medium text-stone-800">{label}</span>
              </div>
              <span className="text-xs text-stone-400">{desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* AC19: Health Status Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(data.health).map(([cat, status]) => {
          const style = HEALTH_STYLES[status]
          return (
            <div key={cat} className={`rounded-lg border p-4 ${style.bg}`}>
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                <span className="text-sm font-medium text-stone-700">{CATEGORY_LABELS[cat] ?? cat}</span>
              </div>
              <p className="mt-1 text-xs text-stone-500">{style.label}</p>
            </div>
          )
        })}
      </div>

      {/* AC22: Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Mensagens (24h)</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{data.metrics.messages_24h}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Tempo Claude (avg)</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">
            {data.metrics.avg_claude_response_ms != null ? `${(data.metrics.avg_claude_response_ms / 1000).toFixed(1)}s` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Fallback RAG</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{data.metrics.rag_fallback_rate}%</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Erros (24h)</p>
          <p className={`mt-1 text-2xl font-semibold ${data.metrics.errors_24h > 0 ? "text-red-600" : "text-stone-900"}`}>
            {data.metrics.errors_24h}
          </p>
        </div>
      </div>

      {/* AC20: Events Table */}
      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-medium text-stone-700">Eventos Recentes</h2>
          <div className="flex gap-2">
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600"
            >
              <option value="">Todos os niveis</option>
              <option value="error">Erro</option>
              <option value="warn">Aviso</option>
              <option value="info">Info</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600"
            >
              <option value="">Todas categorias</option>
              <option value="bot">Bot</option>
              <option value="ai">AI</option>
              <option value="webhook">Webhook</option>
              <option value="cron">Cron</option>
              <option value="system">Sistema</option>
            </select>
          </div>
        </div>

        {data.data.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">Nenhum evento encontrado</div>
        ) : (
          <div className="divide-y divide-stone-50">
            {data.data.map((event) => {
              const style = LEVEL_STYLES[event.level] ?? LEVEL_STYLES.info
              const isExpanded = expandedId === event.id
              return (
                <div key={event.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-25 transition-colors"
                  >
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-[11px] text-stone-400 tabular-nums">{formatTime(event.created_at)}</span>
                    <span className="flex-1 truncate text-xs text-stone-700">{event.message}</span>
                    <span className="text-[10px] text-stone-400">{event.category}</span>
                  </button>
                  {/* AC21: Expandable metadata */}
                  {isExpanded && event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="border-t border-stone-50 bg-stone-50 px-4 py-3">
                      <pre className="overflow-x-auto text-[11px] text-stone-600">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                      {event.source && (
                        <p className="mt-2 text-[10px] text-stone-400">Source: {event.source}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
