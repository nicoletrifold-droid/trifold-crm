"use client"

import { useState, useEffect, useCallback, useRef } from "react"

interface EmailLog {
  id: string
  to_email: string
  to_name: string | null
  subject: string
  status: string
  sent_at: string | null
  created_at: string
  template_id: string | null
  error_message: string | null
  email_templates: { name: string } | null
}

interface Template {
  id: string
  name: string
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: "bg-stone-100",    text: "text-stone-500",   label: "Pendente"  },
  sent:      { bg: "bg-blue-50",      text: "text-blue-600",    label: "Enviado"   },
  delivered: { bg: "bg-emerald-50",   text: "text-emerald-600", label: "Entregue"  },
  opened:    { bg: "bg-green-50",     text: "text-green-700",   label: "Aberto"    },
  clicked:   { bg: "bg-violet-50",    text: "text-violet-700",  label: "Clicado"   },
  bounced:   { bg: "bg-red-50",       text: "text-red-600",     label: "Bounce"    },
  complained:{ bg: "bg-orange-50",    text: "text-orange-600",  label: "Spam"      },
  failed:    { bg: "bg-red-100",      text: "text-red-800",     label: "Falha"     },
}

export function EmailLogsTable() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [total, setTotal] = useState(0)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [resendingId, setResendingId] = useState<string | null>(null)

  const [period, setPeriod] = useState("today")
  const [status, setStatus] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [search, setSearch] = useState("")
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const LIMIT = 50

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) })
    if (period) params.set("period", period)
    if (status) params.set("status", status)
    if (templateId) params.set("template_id", templateId)
    if (search) params.set("search", search)

    const res = await fetch(`/api/admin/email-logs?${params.toString()}`)
    if (!res.ok) return
    const json = (await res.json()) as { data?: EmailLog[]; total?: number }
    setLogs(json.data ?? [])
    setTotal(json.total ?? 0)
    setLoading(false)
  }, [offset, period, status, templateId, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetch("/api/admin/email-templates?limit=100")
      .then((r) => r.json())
      .then((j: { data?: Template[] }) => setTemplates(j.data ?? []))
      .catch(() => {})
  }, [])

  const handleSearchChange = (value: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => {
      setSearch(value)
      setOffset(0)
    }, 300)
  }

  const resend = async (logId: string) => {
    setResendingId(logId)
    await fetch(`/api/admin/email-logs/${logId}/resend`, { method: "POST" })
    setResendingId(null)
    await fetchLogs()
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return "—"
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3">
        <select
          defaultValue="today"
          onChange={(e) => { setPeriod(e.target.value); setOffset(0) }}
          className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600"
        >
          <option value="today">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="">Todos</option>
        </select>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setOffset(0) }}
          className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="sent">Enviado</option>
          <option value="delivered">Entregue</option>
          <option value="opened">Aberto</option>
          <option value="clicked">Clicado</option>
          <option value="bounced">Bounce</option>
          <option value="complained">Spam</option>
          <option value="failed">Falha</option>
        </select>

        <select
          value={templateId}
          onChange={(e) => { setTemplateId(e.target.value); setOffset(0) }}
          className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600"
        >
          <option value="">Todos os templates</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar por email..."
          onChange={(e) => handleSearchChange(e.target.value)}
          className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 placeholder-stone-300 focus:border-indigo-300 focus:outline-none"
        />

        <span className="ml-auto text-xs text-stone-400">{total} registro{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-stone-400">Carregando...</div>
      ) : logs.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-stone-400">Nenhum registro encontrado</div>
      ) : (
        <>
          <div className="divide-y divide-stone-50">
            <div className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-stone-400">
              <span>Destinatário</span>
              <span>Template</span>
              <span>Assunto</span>
              <span>Status</span>
              <span>Enviado em</span>
              <span />
            </div>

            {logs.map((log) => {
              const style = STATUS_STYLES[log.status] ?? STATUS_STYLES.pending
              return (
                <div
                  key={log.id}
                  className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] items-center px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-stone-800">{log.to_email}</p>
                    {log.to_name && (
                      <p className="truncate text-[11px] text-stone-400">{log.to_name}</p>
                    )}
                  </div>
                  <span className="truncate text-xs text-stone-500">
                    {log.email_templates?.name ?? "—"}
                  </span>
                  <span className="truncate text-xs text-stone-600">{log.subject}</span>
                  <span>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                  </span>
                  <span className="text-[11px] tabular-nums text-stone-400">
                    {formatTime(log.sent_at)}
                  </span>
                  <div className="w-16 text-right">
                    {log.status === "failed" && (
                      <button
                        onClick={() => resend(log.id)}
                        disabled={resendingId === log.id}
                        className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-50"
                      >
                        {resendingId === log.id ? "..." : "Reenviar"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="text-xs text-stone-500 hover:text-stone-800 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-xs text-stone-400">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + LIMIT)}
                disabled={offset + LIMIT >= total}
                className="text-xs text-stone-500 hover:text-stone-800 disabled:opacity-40"
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
