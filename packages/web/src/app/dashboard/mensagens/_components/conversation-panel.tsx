"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MessageSquare, ExternalLink } from "lucide-react"
import { AdminChatFeed } from "@web/app/dashboard/obras/[obra_id]/_components/admin-chat-feed"

interface Mensagem {
  id: string
  content: string | null
  message_type: string
  storage_path: string | null
  sender_type: string
  sender_display_name: string | null
  cliente_id: string | null
  created_at: string
}

interface ConversationPanelProps {
  obraId: string | null
  obraName: string | undefined
  clientes?: { id: string; name: string }[]
  adminName: string
  onBack?: () => void
}

export function ConversationPanel({
  obraId,
  obraName,
  clientes,
  adminName,
  onBack,
}: ConversationPanelProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!obraId) {
      setMensagens([])
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/obras/${obraId}/mensagens`)
        if (cancelled) return
        if (res.ok) {
          const { mensagens: data } = await res.json()
          setMensagens(data ?? [])
        }
        // mark as read — fire-and-forget
        fetch(`/api/admin/obras/${obraId}/mensagens/read`, { method: "PATCH" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [obraId])

  if (!obraId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <MessageSquare className="h-12 w-12 text-gray-200" />
        <div>
          <p className="text-sm font-medium text-gray-500">Selecione uma conversa</p>
          <p className="text-xs text-gray-400">
            Escolha uma obra na lista para ver as mensagens
          </p>
        </div>
      </div>
    )
  }

  const obraInitials = (obraName ?? "O")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-2.5 shadow-sm">
        {onBack && (
          <button
            onClick={onBack}
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700 shadow-sm">
          {obraInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {obraName ?? "Obra"}
          </p>
          <p className="text-[11px] text-gray-400">Acompanhamento de obra</p>
        </div>
        <Link
          href={`/dashboard/obras/${obraId}`}
          className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Ver detalhes da obra"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {/* Chat body */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center bg-[#f0ece3]">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        ) : (
          <AdminChatFeed
            obraId={obraId}
            adminName={adminName}
            clientes={clientes}
            initialMensagens={mensagens}
          />
        )}
      </div>
    </div>
  )
}
