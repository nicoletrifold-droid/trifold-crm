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
  clienteId: string | null
  clienteName: string | undefined
  adminName: string
  onBack?: () => void
}

export function ConversationPanel({
  obraId,
  obraName,
  clienteId,
  clienteName,
  adminName,
  onBack,
}: ConversationPanelProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!obraId || !clienteId) {
      setMensagens([])
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/obras/${obraId}/mensagens?cliente_id=${clienteId}`)
        if (cancelled) return
        if (res.ok) {
          const { mensagens: data } = await res.json()
          setMensagens(data ?? [])
        }
        // mark as read for this client — fire-and-forget
        fetch(`/api/admin/obras/${obraId}/mensagens/read?cliente_id=${clienteId}`, {
          method: "PATCH",
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [obraId, clienteId])

  if (!obraId || !clienteId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <MessageSquare className="h-12 w-12 text-gray-200 dark:text-stone-700" />
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-stone-400">Selecione uma conversa</p>
          <p className="text-xs text-gray-400 dark:text-stone-500">
            Escolha um cliente na lista para ver as mensagens
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-stone-800">
        {onBack && (
          <button
            onClick={onBack}
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-stone-100">
            {clienteName ?? "Cliente"}
          </p>
          <p className="truncate text-xs text-gray-400 dark:text-stone-500">{obraName}</p>
        </div>
        <Link
          href={`/dashboard/obras/${obraId}`}
          className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          title="Ver detalhes da obra"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {/* Chat */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          </div>
        ) : (
          <AdminChatFeed
            obraId={obraId}
            adminName={adminName}
            clientes={[{ id: clienteId, name: clienteName ?? "Cliente" }]}
            initialMensagens={mensagens}
          />
        )}
      </div>
    </div>
  )
}
