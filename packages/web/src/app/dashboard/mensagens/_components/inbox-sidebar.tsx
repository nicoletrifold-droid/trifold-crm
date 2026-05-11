"use client"

import { useState } from "react"
import { Search, Inbox } from "lucide-react"

interface ObraInbox {
  obra_id: string
  obra_name: string
  unread_count: number
  last_message: {
    content: string | null
    message_type: string
    sender_type: string
    created_at: string
  } | null
  clientes: { name: string }[]
}

interface InboxSidebarProps {
  obras: ObraInbox[]
  selectedObraId: string | null
  onSelect: (obraId: string) => void
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

function formatPreview(msg: ObraInbox["last_message"]): string {
  if (!msg) return "Sem mensagens"
  if (msg.message_type === "image") return "📷 Foto"
  if (msg.message_type === "audio") return "🎵 Áudio"
  const prefix = msg.sender_type === "equipe" ? "Você: " : ""
  const text = msg.content ?? ""
  return prefix + (text.length > 60 ? text.slice(0, 60) + "…" : text)
}

export function InboxSidebar({ obras, selectedObraId, onSelect }: InboxSidebarProps) {
  const [query, setQuery] = useState("")

  const filtered = obras.filter((o) =>
    o.obra_name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-gray-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar obra..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">
              {query ? "Nenhuma obra encontrada" : "Nenhuma conversa ainda"}
            </p>
          </div>
        ) : (
          filtered.map((obra) => {
            const isActive = obra.obra_id === selectedObraId
            return (
              <button
                key={obra.obra_id}
                onClick={() => onSelect(obra.obra_id)}
                className={`w-full border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-orange-50 ${
                  isActive ? "bg-orange-50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`truncate text-sm font-semibold ${
                          isActive ? "text-orange-700" : "text-gray-900"
                        }`}
                      >
                        {obra.obra_name}
                      </p>
                      {obra.unread_count > 0 && (
                        <span className="flex-shrink-0 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {obra.unread_count > 99 ? "99+" : obra.unread_count}
                        </span>
                      )}
                    </div>
                    {obra.clientes.length > 0 && (
                      <p className="truncate text-xs text-gray-500">
                        {obra.clientes.map((c) => c.name).join(", ")}
                      </p>
                    )}
                    {obra.last_message && (
                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        {formatPreview(obra.last_message)}
                      </p>
                    )}
                  </div>
                  {obra.last_message && (
                    <span className="flex-shrink-0 text-[10px] text-gray-400">
                      {formatRelative(obra.last_message.created_at)}
                    </span>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
