"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Filter, History, RotateCcw } from "lucide-react"

interface AuditLog {
  id: string
  org_id: string
  user_id: string
  user_name: string
  action: string
  entity_type: string | null
  entity_id: string | null
  entity_name: string | null
  obra_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

interface UserOption {
  id: string
  name: string
  email: string
}

interface AuditLogsResponse {
  logs: AuditLog[]
  total: number
}

interface UsersResponse {
  users: UserOption[]
}

const PAGE_SIZE = 100

const ACTION_LABELS: Record<string, string> = {
  "obra.create": "Obra criada",
  "obra.update": "Obra atualizada",
  "obra.delete": "Obra arquivada",
  "obra.reativar": "Obra reativada",
  "documento.upload": "Documento enviado",
  "documento.delete": "Documento excluído",
  "documento.view": "Documento visualizado",
  "foto.upload": "Foto enviada",
  "foto.delete": "Foto excluída",
  "session.login": "Login",
  "session.logout": "Logout",
}

// Tipos de ação: cada tipo expõe um conjunto fixo de "ações específicas".
// Quando o usuário escolhe um tipo, o select de Ação Específica é populado
// com as opções correspondentes. A opção "Todas (prefixo)" envia
// `action=<prefixo>.` ao backend para filtro por prefixo via ILIKE.
const ACTION_TYPES: Array<{
  value: string
  label: string
  prefix: string
  entity_type: string
  actions: string[]
}> = [
  {
    value: "obra",
    label: "Obras",
    prefix: "obra.",
    entity_type: "obra",
    actions: ["obra.create", "obra.update", "obra.delete", "obra.reativar"],
  },
  {
    value: "documento",
    label: "Documentos",
    prefix: "documento.",
    entity_type: "documento",
    actions: ["documento.upload", "documento.delete", "documento.view"],
  },
  {
    value: "foto",
    label: "Fotos",
    prefix: "foto.",
    entity_type: "foto",
    actions: ["foto.upload", "foto.delete"],
  },
  {
    value: "session",
    label: "Sessão",
    prefix: "session.",
    entity_type: "session",
    actions: ["session.login", "session.logout"],
  },
]

interface FilterState {
  user_id: string
  type: string // valor de ACTION_TYPES (ou "")
  action: string // ação específica (ou "" para todas do tipo)
  obra_id: string
  date_from: string
  date_to: string
}

const EMPTY_FILTERS: FilterState = {
  user_id: "",
  type: "",
  action: "",
  obra_id: "",
  date_from: "",
  date_to: "",
}

function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * Constrói os query params a serem enviados ao backend a partir do estado
 * de filtros. Lógica de tradução tipo+ação:
 *   - type vazio                  → nenhum filtro de action/entity_type
 *   - type definido + action ""   → action=<prefix>. (filtro por prefixo) + entity_type
 *   - type definido + action !=""  → action=<exato>  + entity_type
 */
function buildBaseParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.user_id) params.set("user_id", filters.user_id)
  if (filters.type) {
    const typeDef = ACTION_TYPES.find((t) => t.value === filters.type)
    if (typeDef) {
      params.set("entity_type", typeDef.entity_type)
      if (filters.action) {
        params.set("action", filters.action)
      } else {
        params.set("action", typeDef.prefix)
      }
    }
  }
  if (filters.obra_id) params.set("obra_id", filters.obra_id)
  if (filters.date_from) {
    // Inclusão do dia inteiro: 00:00:00
    params.set("date_from", `${filters.date_from}T00:00:00`)
  }
  if (filters.date_to) {
    // Inclusão do dia inteiro: 23:59:59.999
    params.set("date_to", `${filters.date_to}T23:59:59.999`)
  }
  return params
}

export default function AuditLogsPage() {
  // Filtros em edição (controles) vs filtros aplicados (usados na query).
  // Só atualizamos os aplicados ao clicar em "Filtrar" — evita refetch a
  // cada digitação.
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carregamento dos usuários para o select (uma vez).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/users")
        if (!res.ok) return
        const json: UsersResponse = await res.json()
        if (!cancelled) setUsers(json.users ?? [])
      } catch {
        // Falha silenciosa: o select fica vazio mas a página continua funcional.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = buildBaseParams(appliedFilters)
      params.set("limit", String(PAGE_SIZE))
      params.set("offset", String(page * PAGE_SIZE))

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      if (res.status === 403) {
        setError("Acesso restrito a administradores")
        setLogs([])
        setTotal(0)
        return
      }
      if (!res.ok) {
        throw new Error("Falha ao carregar logs")
      }
      const json: AuditLogsResponse = await res.json()
      setLogs(json.logs ?? [])
      setTotal(json.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [appliedFilters, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters)
    setPage(0)
  }

  const handleResetFilters = () => {
    setDraftFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = buildBaseParams(appliedFilters)
      const res = await fetch(`/api/admin/audit-logs/export?${params.toString()}`)
      if (!res.ok) {
        setError("Falha ao exportar CSV")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // revoke imediatamente após o clique — sem leak de memória.
      URL.revokeObjectURL(url)
    } catch {
      setError("Falha ao exportar CSV")
    } finally {
      setExporting(false)
    }
  }

  // Lista de ações específicas a exibir no segundo select.
  const specificActions = useMemo(() => {
    if (!draftFilters.type) return []
    const typeDef = ACTION_TYPES.find((t) => t.value === draftFilters.type)
    return typeDef?.actions ?? []
  }, [draftFilters.type])

  // Quando o tipo muda, zera a ação específica (evita combinação inválida).
  const handleTypeChange = (value: string) => {
    setDraftFilters((prev) => ({ ...prev, type: value, action: "" }))
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 0
  const hasNext = (page + 1) * PAGE_SIZE < total

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <Link
          href="/dashboard/sistema"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          &larr; Sistema
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <History className="h-5 w-5 text-orange-600" />
          <h1 className="text-xl font-semibold text-stone-900">Log de Atividades</h1>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Auditoria completa de ações realizadas no sistema.
        </p>
      </div>

      {/* Painel de filtros */}
      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
          <Filter className="h-4 w-4 text-stone-500" />
          <h2 className="text-sm font-medium text-stone-700">Filtros</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Usuário */}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Usuário</label>
            <select
              value={draftFilters.user_id}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, user_id: e.target.value }))
              }
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700"
            >
              <option value="">Todos os usuários</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de ação */}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Tipo de ação
            </label>
            <select
              value={draftFilters.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700"
            >
              <option value="">Todos os tipos</option>
              {ACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Ação específica (depende do tipo) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Ação específica
            </label>
            <select
              value={draftFilters.action}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, action: e.target.value }))
              }
              disabled={!draftFilters.type}
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700 disabled:bg-stone-50 disabled:text-stone-400"
            >
              <option value="">Todas do tipo</option>
              {specificActions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] ?? a}
                </option>
              ))}
            </select>
          </div>

          {/* Obra ID */}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Obra ID</label>
            <input
              type="text"
              value={draftFilters.obra_id}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, obra_id: e.target.value }))
              }
              placeholder="ID da obra"
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700"
            />
          </div>

          {/* Data de */}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">De</label>
            <input
              type="date"
              value={draftFilters.date_from}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, date_from: e.target.value }))
              }
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700"
            />
          </div>

          {/* Data até */}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Até</label>
            <input
              type="date"
              value={draftFilters.date_to}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, date_to: e.target.value }))
              }
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-4 py-3">
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 rounded border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar
          </button>
          <button
            type="button"
            onClick={handleApplyFilters}
            className="inline-flex items-center gap-1.5 rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtrar
          </button>
        </div>
      </div>

      {/* Toolbar: total + exportar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          {loading ? (
            "Carregando…"
          ) : (
            <>
              <span className="font-medium text-stone-900">{total}</span>{" "}
              {total === 1 ? "registro encontrado" : "registros encontrados"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || total === 0}
          className="inline-flex items-center gap-1.5 rounded border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      {/* Tabela de logs */}
      <div className="rounded-lg border border-stone-200 bg-white">
        {error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
        ) : loading ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">
            Carregando logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stone-400">
            Nenhum registro encontrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-100 text-sm">
              <thead className="bg-stone-50">
                <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-2">Data/Hora</th>
                  <th className="px-4 py-2">Usuário</th>
                  <th className="px-4 py-2">Ação</th>
                  <th className="px-4 py-2">Entidade</th>
                  <th className="px-4 py-2">Obra</th>
                  <th className="px-4 py-2">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-25">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-stone-500 tabular-nums">
                      {formatDateBR(log.created_at)}
                    </td>
                    <td className="px-4 py-2 text-stone-700">{log.user_name}</td>
                    <td className="px-4 py-2 text-stone-700">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </td>
                    <td className="px-4 py-2 text-stone-600">
                      {log.entity_name ?? log.entity_type ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-stone-500">
                      {log.obra_id ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-stone-400 tabular-nums">
                      {log.ip_address ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">
            Página <span className="font-medium text-stone-700">{page + 1}</span> de{" "}
            <span className="font-medium text-stone-700">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!hasPrev || loading}
              className="rounded border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || loading}
              className="rounded border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
