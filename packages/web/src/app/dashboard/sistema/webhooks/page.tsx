"use client"

import { useEffect, useState, useCallback } from "react"

interface WebhookLog {
  id: string
  source: string
  event_type: string | null
  leadgen_id: string | null
  signature_valid: boolean
  processed: boolean
  processing_error: string | null
  created_at: string
}

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  whatsapp: "WhatsApp",
  google_forms: "Google Forms",
  other: "Outro",
}

function StatusBadge({ processed, error }: { processed: boolean; error: string | null }) {
  if (error) {
    return (
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-700">
        Erro
      </span>
    )
  }
  if (processed) {
    return (
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700">
        Processado
      </span>
    )
  }
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-stone-100 text-stone-500">
      Pendente
    </span>
  )
}

export default function WebhookLogsPage() {
  const [data, setData] = useState<WebhookLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSource, setFilterSource] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (filterSource) params.set("source", filterSource)

      const res = await fetch(`/api/admin/webhook-logs?${params.toString()}`)
      if (res.status === 403) {
        setError("Acesso restrito a administradores")
        return
      }
      if (!res.ok) throw new Error("Erro ao carregar logs")

      const json = await res.json()
      setData(json.data ?? [])
      setTotal(json.total ?? 0)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }, [filterSource])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">{error}</p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Webhook Logs</h1>
          <p className="mt-0.5 text-sm text-stone-500">{total} eventos registrados</p>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-medium text-stone-700">Eventos Recentes</h2>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600"
          >
            <option value="">Todas as origens</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="google_forms">Google Forms</option>
          </select>
        </div>

        {data.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">
            Nenhum evento encontrado
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {data.map((log) => {
              const isExpanded = expandedId === log.id
              return (
                <div key={log.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-25 transition-colors"
                  >
                    <span className="text-[11px] text-stone-400 tabular-nums w-32 shrink-0">
                      {formatTime(log.created_at)}
                    </span>
                    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 shrink-0">
                      {SOURCE_LABELS[log.source] ?? log.source}
                    </span>
                    <span className="text-xs text-stone-600 shrink-0">
                      {log.event_type ?? "—"}
                    </span>
                    <span className="flex-1 truncate text-[11px] text-stone-400 font-mono">
                      {log.leadgen_id ? log.leadgen_id.slice(0, 16) + "…" : "—"}
                    </span>
                    <span className="text-[10px] text-stone-400 shrink-0">
                      {log.signature_valid ? "✓ sig" : "✗ sig"}
                    </span>
                    <StatusBadge processed={log.processed} error={log.processing_error} />
                  </button>
                  {isExpanded && (
                    <div className="border-t border-stone-50 bg-stone-50 px-4 py-3 space-y-1">
                      {log.leadgen_id && (
                        <p className="text-[11px] text-stone-600">
                          <span className="font-medium">Leadgen ID:</span> {log.leadgen_id}
                        </p>
                      )}
                      {log.processing_error && (
                        <p className="text-[11px] text-red-600">
                          <span className="font-medium">Erro:</span> {log.processing_error}
                        </p>
                      )}
                      <p className="text-[10px] text-stone-400">ID: {log.id}</p>
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
