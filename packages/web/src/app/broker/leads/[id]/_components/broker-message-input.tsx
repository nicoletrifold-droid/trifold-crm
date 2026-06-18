"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Paperclip, Send, Loader2 } from "lucide-react"
import { MediaPickerModal } from "./media-picker-modal"

const MAX_MESSAGE_LENGTH = 4096

export interface OptimisticMessage {
  id: string
  role: string
  content: string
  created_at: string
  pending?: boolean
  failed?: boolean
}

interface BrokerMessageInputProps {
  leadId: string
  /** Callback opcional para optimistic update na lista de mensagens. */
  onSent?: (msg: OptimisticMessage) => void
  /**
   * Story 63-4 — quando `true`, o composer é desabilitado proativamente porque
   * a janela de 24h do WhatsApp está fechada (sem precisar tentar enviar).
   */
  disabledByWindow?: boolean
}

/**
 * Story 51-1 (Epic 51) — Input de envio de mensagem do corretor.
 *
 * Envia para POST /api/leads/[id]/send-message. Trata o caso
 * WHATSAPP_WINDOW_CLOSED com aviso amigável. Após sucesso, faz refresh do
 * server component (re-fetch) para refletir a mensagem gravada.
 */
export function BrokerMessageInput({ leadId, onSent, disabledByWindow = false }: BrokerMessageInputProps) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMediaPicker, setShowMediaPicker] = useState(false)

  const trimmed = text.trim()
  const disabled = loading || trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH
  // Story 63-4 — combina o disabled interno (loading/conteúdo) com o bloqueio por janela.
  const isDisabled = disabled || disabledByWindow

  async function handleSend() {
    if (isDisabled) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/leads/${leadId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.success) {
        if (data?.error === "WHATSAPP_WINDOW_CLOSED") {
          setError(
            data.message ??
              "Fora da janela de 24h do WhatsApp. Aguarde o lead responder para enviar uma nova mensagem."
          )
        } else {
          setError(data?.message ?? "Não foi possível enviar a mensagem. Tente novamente.")
        }
        return
      }

      onSent?.({
        id: data.messageId,
        role: "broker",
        content: trimmed,
        created_at: new Date().toISOString(),
        failed: data.sent === false,
      })
      setText("")
      // Re-fetch do server component para refletir a mensagem gravada (AC5).
      router.refresh()
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <>
      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-stone-800">
        {disabledByWindow && (
          <p className="mb-2 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            Janela de 24h encerrada. Aguarde o lead responder para continuar a conversa.
          </p>
        )}
        {error && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
            onClick={() => setShowMediaPicker(true)}
            disabled={disabledByWindow}
            className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:border-orange-500 dark:hover:text-orange-400"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            placeholder="Digite sua mensagem para o lead…"
            disabled={loading || disabledByWindow}
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isDisabled}
            aria-label="Enviar mensagem"
            className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-gray-400 lg:justify-between dark:text-stone-500">
          <span className="hidden lg:inline">Ctrl/Cmd + Enter para enviar</span>
          <span>
            {trimmed.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
      </div>

      {showMediaPicker && (
        <MediaPickerModal
          leadId={leadId}
          onClose={() => setShowMediaPicker(false)}
        />
      )}
    </>
  )
}
