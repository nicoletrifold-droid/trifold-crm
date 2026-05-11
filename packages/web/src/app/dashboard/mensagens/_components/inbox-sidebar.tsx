"use client"

import { ChevronLeft, ChevronRight, Inbox, Loader2, Search, User } from "lucide-react"
import type { MensagensFilters } from "./mensagens-inbox"
import type { ClienteConversa } from "@web/app/api/admin/mensagens/route"

interface InboxSidebarProps {
  conversas: ClienteConversa[]
  selectedConversaId: string | null
  loading: boolean
  filters: MensagensFilters
  page: number
  totalPages: number
  total: number
  onSelect: (conversa: ClienteConversa) => void
  onFiltersChange: (f: MensagensFilters) => void
  onPageChange: (page: number) => void
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "ontem"
  return `${days}d`
}

function formatPreview(msg: ClienteConversa["last_message"]): string {
  if (!msg) return "Sem mensagens"
  if (msg.message_type === "image") return "📷 Foto"
  if (msg.message_type === "audio") return "🎵 Áudio"
  const prefix = msg.sender_type === "equipe" ? "Você: " : ""
  const text = msg.content ?? ""
  return prefix + (text.length > 55 ? text.slice(0, 55) + "…" : text)
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

export function InboxSidebar({
  conversas,
  selectedConversaId,
  loading,
  filters,
  page,
  totalPages,
  total,
  onSelect,
  onFiltersChange,
  onPageChange,
}: InboxSidebarProps) {
  function setFilter<K extends keyof MensagensFilters>(key: K, value: MensagensFilters[K]) {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filtros */}
      <div className="space-y-2 border-b border-gray-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cliente ou empreendimento..."
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={filters.unread_only}
            onChange={(e) => setFilter("unread_only", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-orange-500"
          />
          Apenas não lidas
        </label>
      </div>

      {/* Lista de conversas */}
      <div className="relative flex-1 overflow-y-auto">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          </div>
        )}

        {!loading && conversas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">
              {filters.q || filters.unread_only
                ? "Nenhuma conversa encontrada"
                : "Nenhuma conversa ainda"}
            </p>
          </div>
        ) : (
          conversas.map((conversa) => {
            const isActive = conversa.conversa_id === selectedConversaId
            const hasUnread = conversa.unread_count > 0
            const initials = getInitials(conversa.cliente_name) || <User className="h-4 w-4" />

            return (
              <button
                key={conversa.conversa_id}
                onClick={() => onSelect(conversa)}
                className={`w-full border-b border-gray-100 px-3 py-3 text-left transition-colors hover:bg-orange-50 ${
                  isActive ? "bg-orange-50" : "bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar do cliente */}
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      isActive
                        ? "bg-orange-500 text-white"
                        : hasUnread
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {typeof initials === "string" ? initials : initials}
                  </div>

                  {/* Conteúdo */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p
                        className={`truncate text-sm ${
                          hasUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                        } ${isActive ? "text-orange-700" : ""}`}
                      >
                        {conversa.cliente_name || "Cliente"}
                      </p>
                      {conversa.last_message && (
                        <span
                          className={`flex-shrink-0 text-[10px] ${
                            hasUnread ? "font-semibold text-orange-500" : "text-gray-400"
                          }`}
                        >
                          {formatRelative(conversa.last_message.created_at)}
                        </span>
                      )}
                    </div>

                    {/* Nome da obra (empreendimento) */}
                    <p className="truncate text-xs text-gray-400">{conversa.obra_name}</p>

                    {/* Preview + badge */}
                    <div className="mt-0.5 flex items-center justify-between gap-1">
                      <p
                        className={`truncate text-xs ${
                          hasUnread ? "font-medium text-gray-700" : "text-gray-400"
                        }`}
                      >
                        {formatPreview(conversa.last_message)}
                      </p>
                      {hasUnread && (
                        <span className="flex-shrink-0 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {conversa.unread_count > 99 ? "99+" : conversa.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
          <span className="text-[10px] text-gray-400">
            {total} conversa{total !== 1 ? "s" : ""} · p. {page}/{totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1 || loading}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages || loading}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
