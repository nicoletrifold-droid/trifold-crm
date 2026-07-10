"use client"

import Link from "next/link"
import { useEffect, useState, useCallback } from "react"
import { Mail, LayoutTemplate, Zap, Send, Settings, Rocket, History, Activity, Gauge, MessageCircle, Wallet, type LucideIcon } from "lucide-react"

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

interface WhatsappWindow {
  recebidas: number
  enviadas: number
  total: number
}
interface WhatsappVolume {
  h24: WhatsappWindow
  d7: WhatsappWindow
  d30: WhatsappWindow
}

interface WhatsappCostWindow {
  disparos: number
  custo_brl: number
}
interface WhatsappCost {
  h24: WhatsappCostWindow
  d7: WhatsappCostWindow
  d30: WhatsappCostWindow & { por_categoria?: Record<string, number> }
}

interface Metrics {
  errors_24h: number
  messages_24h: number
  avg_claude_response_ms: number | null
  rag_fallback_rate: number
  whatsapp_volume: WhatsappVolume | null
  whatsapp_cost: WhatsappCost | null
}

type HealthStatus = "green" | "yellow" | "red"

interface SystemData {
  data: SystemEvent[]
  metrics: Metrics
  health: Record<string, HealthStatus>
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  error: { bg: "bg-red-50 dark:bg-red-500/15", text: "text-red-700 dark:text-red-400", label: "Erro" },
  warn: { bg: "bg-amber-50 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400", label: "Aviso" },
  info: { bg: "bg-blue-50 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-400", label: "Info" },
}

const HEALTH_STYLES: Record<HealthStatus, { bg: string; dot: string; label: string }> = {
  green: { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-700", dot: "bg-emerald-500", label: "Saudavel" },
  yellow: { bg: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-700", dot: "bg-amber-500", label: "Atencao" },
  red: { bg: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-700", dot: "bg-red-500", label: "Critico" },
}

const CATEGORY_LABELS: Record<string, string> = {
  bot: "Bot",
  ai: "AI / Claude",
  webhook: "Webhooks",
  cron: "Cron Jobs",
}

function SectionHeader({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Icon className="h-4 w-4 text-orange-600" />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{title}</h2>
      {meta && <div className="ml-auto text-xs text-stone-400 dark:text-stone-500">{meta}</div>}
    </div>
  )
}

export default function SistemaPage() {
  const [data, setData] = useState<SystemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterLevel, setFilterLevel] = useState<string>("")
  const [filterCategory, setFilterCategory] = useState<string>("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [access, setAccess] = useState<{ full: boolean; notificacoesFinanceiras: boolean } | null>(null)

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

  // 1º: descobre o que o usuário pode ver. Só busca telemetria (system-events)
  // se tiver acesso TOTAL — supervisor com só o sub-módulo vê apenas o card dele.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    fetch("/api/sistema/access")
      .then((r) => (r.ok ? r.json() : { full: false, notificacoesFinanceiras: false }))
      .then((acc) => {
        setAccess(acc)
        if (acc.full) {
          fetchData()
          interval = setInterval(fetchData, 30000)
        } else {
          setLoading(false)
        }
      })
      .catch(() => { setAccess({ full: false, notificacoesFinanceiras: false }); setLoading(false) })
    return () => { if (interval) clearInterval(interval) }
  }, [fetchData])

  if (access && !access.full && !access.notificacoesFinanceiras) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">Acesso restrito.</p>
      </div>
    )
  }

  if (access?.full && error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">{error}</p>
      </div>
    )
  }

  if (!access || (access.full && (loading || !data))) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  // Modo restrito (só sub-módulo): mostra apenas os cards permitidos.
  if (!access.full) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Sistema</h1>
        <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
            <History className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Auditoria</h2>
          </div>
          <div className="space-y-2 p-4">
            {access.notificacoesFinanceiras && (
              <Link
                href="/dashboard/sistema/notificacoes-financeiras"
                className="flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-orange-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Wallet className="h-4 w-4 text-orange-600" />
                Notificações Financeiras
                <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">Boletos por cliente e empreendimento →</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  if (!data) return null // acesso total garantido aqui; narrowing p/ o TS

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Sistema</h1>

      {/* Email Marketing hub */}
      <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <Mail className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Email Marketing</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-stone-100 lg:grid-cols-3 dark:bg-stone-800">
          {[
            { href: "/dashboard/sistema/emails", icon: Mail, label: "Monitoramento", desc: "Status e métricas" },
            { href: "/dashboard/sistema/email-templates", icon: LayoutTemplate, label: "Templates", desc: "Criar e editar" },
            { href: "/dashboard/sistema/email-automacoes", icon: Zap, label: "Automações", desc: "Triggers de envio" },
            { href: "/dashboard/sistema/email-blasts", icon: Send, label: "Disparos", desc: "Email em massa" },
            { href: "/dashboard/sistema/email-envio-rapido", icon: Rocket, label: "Envio Rápido", desc: "Email avulso" },
            { href: "/dashboard/sistema/email-configuracoes", icon: Settings, label: "Configurações", desc: "Remetente e quotas" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-1 bg-white px-4 py-3 transition-colors hover:bg-orange-50 dark:bg-stone-900 dark:hover:bg-stone-800"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{label}</span>
              </div>
              <span className="text-xs text-stone-400 dark:text-stone-500">{desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Plataforma — Saúde & Billing (Story 78-9) */}
      <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <Wallet className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Plataforma</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-stone-100 lg:grid-cols-3 dark:bg-stone-800">
          {[
            { href: "/dashboard/sistema/billing", icon: Wallet, label: "Saúde & Billing", desc: "Custos, vencimentos e links" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-1 bg-white px-4 py-3 transition-colors hover:bg-orange-50 dark:bg-stone-900 dark:hover:bg-stone-800"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{label}</span>
              </div>
              <span className="text-xs text-stone-400 dark:text-stone-500">{desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Auditoria */}
      <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <History className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Auditoria</h2>
        </div>
        <div className="space-y-2 p-4">
          <Link
            href="/dashboard/sistema/logs"
            className="flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-orange-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <History className="h-4 w-4 text-orange-600" />
            Log de Atividades
            <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">Auditoria completa →</span>
          </Link>
          <Link
            href="/dashboard/sistema/notificacoes-financeiras"
            className="flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-orange-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <Wallet className="h-4 w-4 text-orange-600" />
            Notificações Financeiras
            <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">Boletos por cliente e empreendimento →</span>
          </Link>
        </div>
      </div>

      {/* Saúde do sistema */}
      <div>
        <SectionHeader icon={Activity} title="Saúde do sistema" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Object.entries(data.health).map(([cat, status]) => {
            const style = HEALTH_STYLES[status]
            return (
              <div key={cat} className={`rounded-lg border p-4 ${style.bg}`}>
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">{CATEGORY_LABELS[cat] ?? cat}</span>
                </div>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{style.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Métricas (24h) */}
      <div>
        <SectionHeader icon={Gauge} title="Métricas · últimas 24h" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Mensagens (24h)</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.messages_24h}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Tempo Claude (avg)</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
              {data.metrics.avg_claude_response_ms != null ? `${(data.metrics.avg_claude_response_ms / 1000).toFixed(1)}s` : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Fallback RAG</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.rag_fallback_rate}%</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-xs text-stone-500 dark:text-stone-400">Erros (24h)</p>
            <p className={`mt-1 text-2xl font-semibold ${data.metrics.errors_24h > 0 ? "text-red-600" : "text-stone-900 dark:text-stone-100"}`}>
              {data.metrics.errors_24h}
            </p>
          </div>
        </div>
      </div>

      {/* WhatsApp — volume + disparos & custo (Stories 75-61 / 75-62) */}
      {(data.metrics.whatsapp_volume || data.metrics.whatsapp_cost) && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/40">
          <SectionHeader
            icon={MessageCircle}
            title="WhatsApp"
            meta={data.metrics.whatsapp_volume ? `Últimos 30 dias · ${data.metrics.whatsapp_volume.d30.recebidas} recebidas · ${data.metrics.whatsapp_volume.d30.enviadas} enviadas` : undefined}
          />
          <div className="space-y-5">
            {data.metrics.whatsapp_volume && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">Volume — mensagens trocadas</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Recebidas (24h)</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.whatsapp_volume.h24.recebidas}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Enviadas (24h)</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.whatsapp_volume.h24.enviadas}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Recebidas (7d)</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.whatsapp_volume.d7.recebidas}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Enviadas (7d)</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.whatsapp_volume.d7.enviadas}</p>
                  </div>
                </div>
              </div>
            )}
            {data.metrics.whatsapp_cost && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">Disparos &amp; custo estimado</p>
                  <a href="https://business.facebook.com/billing_hub/accounts" target="_blank" rel="noreferrer" className="text-xs font-medium text-[#E8856A] hover:underline">Fatura na Meta ↗</a>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Disparos pagos (24h)</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.whatsapp_cost.h24.disparos}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Custo est. (24h)</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">R$ {Number(data.metrics.whatsapp_cost.h24.custo_brl).toFixed(2).replace(".", ",")}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Disparos pagos (30d)</p>
                    <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{data.metrics.whatsapp_cost.d30.disparos}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <p className="text-xs text-stone-500 dark:text-stone-400">Custo est. (30d)</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">R$ {Number(data.metrics.whatsapp_cost.d30.custo_brl).toFixed(2).replace(".", ",")}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
                  Estimativa (preço Meta × disparos de template) — não é a fatura oficial. Conta a partir do deploy desta função. Respostas dentro da janela de 24h são grátis.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Eventos Recentes</h2>
          <div className="flex gap-2">
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
            >
              <option value="">Todos os niveis</option>
              <option value="error">Erro</option>
              <option value="warn">Aviso</option>
              <option value="info">Info</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
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
          <div className="divide-y divide-stone-50 dark:divide-stone-800">
            {data.data.map((event) => {
              const style = LEVEL_STYLES[event.level] ?? LEVEL_STYLES.info!
              const isExpanded = expandedId === event.id
              return (
                <div key={event.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
                  >
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-stone-400">{formatTime(event.created_at)}</span>
                    <span className="flex-1 truncate text-xs text-stone-700 dark:text-stone-300">{event.message}</span>
                    <span className="text-[10px] text-stone-400">{event.category}</span>
                  </button>
                  {isExpanded && event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="border-t border-stone-50 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-800">
                      <pre className="overflow-x-auto text-[11px] text-stone-600 dark:text-stone-400">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                      {event.source && (
                        <p className="mt-2 text-[10px] text-stone-400">{event.source}</p>
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
