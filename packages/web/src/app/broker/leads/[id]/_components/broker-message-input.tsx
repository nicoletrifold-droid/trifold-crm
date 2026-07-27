"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Paperclip,
  Send,
  Loader2,
  Bell,
  BellRing,
  MessageSquarePlus,
} from "lucide-react"
import { MediaPickerModal } from "./media-picker-modal"
import { AudioRecorder } from "./audio-recorder"
import { brokerSendErrorMessage } from "@web/lib/broker/send-errors"
// Story 83-2 — guarda ortográfica no envio (Epic 83)
import { reviewOutgoing } from "@web/lib/messages/review-outgoing"
import { ReviewSuggestion } from "@web/components/messages/review-suggestion"

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
  /**
   * Story 63-10 — estado inicial de `leads.metadata.notify_broker_on_reply`.
   * Quando a janela está fechada, controla o botão "me avisar quando o lead
   * responder" (já confirmado se `true`).
   */
  notifyOnReply?: boolean
}

/**
 * Story 51-1 (Epic 51) — Input de envio de mensagem do corretor.
 *
 * Envia para POST /api/leads/[id]/send-message. Trata o caso
 * WHATSAPP_WINDOW_CLOSED com aviso amigável. Após sucesso, faz refresh do
 * server component (re-fetch) para refletir a mensagem gravada.
 */
export function BrokerMessageInput({
  leadId,
  onSent,
  disabledByWindow = false,
  notifyOnReply = false,
}: BrokerMessageInputProps) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  // Story 83-2 — sugestão da revisão ortográfica pendente de decisão do corretor.
  const [suggestion, setSuggestion] = useState<string | null>(null)
  // Story 63-10 — caminho de saída quando a janela de 24h está fechada.
  const [notifyEnabled, setNotifyEnabled] = useState(notifyOnReply)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  // Story 75-142 — "Iniciar atendimento" via template (janela fechada / lead frio).
  // Story 75-217 — o botão abre um menu com os templates de abertura aprovados
  // na Meta (um por contexto), com preview já renderizado para este lead.
  const [startDone, setStartDone] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templates, setTemplates] = useState<Array<{ name: string; preview: string }> | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null)

  async function handleToggleTemplates() {
    if (startDone || sendingTemplate) return
    setStartError(null)
    if (templatesOpen) {
      setTemplatesOpen(false)
      return
    }
    setTemplatesOpen(true)
    if (templates !== null || templatesLoading) return
    setTemplatesLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/opening-templates`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setStartError(data?.message ?? "Não foi possível carregar as mensagens. Tente novamente.")
        setTemplatesOpen(false)
        return
      }
      setTemplates(data.templates as Array<{ name: string; preview: string }>)
    } catch {
      setStartError("Erro de conexão. Tente novamente.")
      setTemplatesOpen(false)
    } finally {
      setTemplatesLoading(false)
    }
  }

  async function handleStartWhatsapp(templateName: string) {
    if (sendingTemplate || startDone) return
    setSendingTemplate(templateName)
    setStartError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/start-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateName }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setStartError(data?.message ?? "Não foi possível iniciar o atendimento. Tente novamente.")
        return
      }
      setStartDone(true)
      setTemplatesOpen(false)
      router.refresh()
    } catch {
      setStartError("Erro de conexão. Tente novamente.")
    } finally {
      setSendingTemplate(null)
    }
  }

  async function handleNotifyOnReply() {
    if (notifyEnabled || notifyLoading) return
    setNotifyLoading(true)
    setNotifyError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/notify-on-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setNotifyError("Não foi possível configurar o aviso. Tente novamente.")
        return
      }
      setNotifyEnabled(true)
    } catch {
      setNotifyError("Erro de conexão. Tente novamente.")
    } finally {
      setNotifyLoading(false)
    }
  }

  const trimmed = text.trim()
  const disabled = loading || trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH
  // Story 63-4 — combina o disabled interno (loading/conteúdo) com o bloqueio por janela.
  const isDisabled = disabled || disabledByWindow

  // Story 83-2 — envio efetivo (com auditoria do original quando corrigida).
  async function dispatch(outgoing: string, reviewedOriginal?: string) {
    try {
      const res = await fetch(`/api/leads/${leadId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outgoing,
          ...(reviewedOriginal ? { original_message: reviewedOriginal } : {}),
        }),
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
        content: outgoing,
        created_at: new Date().toISOString(),
        failed: data.sent === false,
      })
      setText("")
      setSuggestion(null)
      // Story 75-141 — mensagem gravada, mas não entregue (ex.: número sem WhatsApp):
      // avisa o motivo (a bolha já fica marcada como não enviada).
      if (data.sent === false) {
        setError(brokerSendErrorMessage(data.sendError))
      }
      // Re-fetch do server component para refletir a mensagem gravada (AC5).
      router.refresh()
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (isDisabled) return
    setLoading(true)
    setError(null)

    // Story 83-2 — guarda ortográfica: erro claro → sugestão; falha/limpo → envia
    // (fail-open, a revisão nunca bloqueia).
    const corrected = await reviewOutgoing(trimmed)
    if (corrected) {
      setSuggestion(corrected)
      setLoading(false)
      return
    }
    await dispatch(trimmed)
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
          <div className="mb-2 space-y-2">
            <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              Janela de 24h encerrada. Aguarde o lead responder para continuar a conversa.
            </p>

            {/* Story 63-10 — Caminho 1: avisar quando o lead responder */}
            {notifyEnabled ? (
              <div
                className="flex min-h-[44px] items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400"
                aria-live="polite"
              >
                <BellRing className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Aviso configurado
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleNotifyOnReply()}
                disabled={notifyLoading}
                aria-label="Me avisar quando o lead responder"
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notifyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Bell className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                )}
                Me avisar quando o lead responder
              </button>
            )}
            {notifyError && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {notifyError}
              </p>
            )}

            {/* Story 75-142 — Caminho 2: iniciar atendimento via template aprovado */}
            {startDone ? (
              <div className="flex min-h-[44px] items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400" aria-live="polite">
                <MessageSquarePlus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Convite enviado. Aguarde a resposta do cliente para continuar.
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleToggleTemplates()}
                  disabled={templatesLoading || sendingTemplate !== null}
                  aria-expanded={templatesOpen}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                >
                  {templatesLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquarePlus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                  Iniciar atendimento (mensagem de abertura)
                </button>
                {templatesOpen && templates !== null && (
                  <div className="space-y-2" role="listbox" aria-label="Escolha a mensagem de abertura">
                    {templates.length === 0 && (
                      <p className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                        Nenhuma mensagem de abertura aprovada disponível no momento.
                      </p>
                    )}
                    {templates.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => void handleStartWhatsapp(t.name)}
                        disabled={sendingTemplate !== null}
                        className="flex w-full items-start gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-left text-sm text-stone-700 hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/10"
                      >
                        {sendingTemplate === t.name ? (
                          <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        ) : (
                          <MessageSquarePlus className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        )}
                        <span className="whitespace-pre-line">{t.preview}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="px-1 text-xs text-stone-500 dark:text-stone-500">
                  {templatesOpen
                    ? "Toque na mensagem que combina com o contexto do lead — ela será enviada como está."
                    : "Abre as mensagens de abertura aprovadas pelo WhatsApp para reabrir a conversa com o cliente."}
                </p>
              </>
            )}
            {startError && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {startError}
              </p>
            )}
          </div>
        )}
        {suggestion && (
          <ReviewSuggestion
            corrected={suggestion}
            disabled={loading}
            onAcceptCorrected={() => {
              setLoading(true)
              setError(null)
              void dispatch(suggestion, trimmed)
            }}
            onSendOriginal={() => {
              setLoading(true)
              setError(null)
              setSuggestion(null)
              void dispatch(trimmed)
            }}
          />
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
            onChange={(e) => {
              setText(e.target.value)
              if (suggestion) setSuggestion(null) // editar invalida a sugestão
            }}
            onKeyDown={handleKeyDown}
            spellCheck
            lang="pt-BR"
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            placeholder="Digite sua mensagem para o lead…"
            disabled={loading || disabledByWindow}
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
          <AudioRecorder
            leadId={leadId}
            disabled={disabledByWindow || loading}
            onSent={onSent}
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
          <span className="max-lg:hidden lg:inline">Ctrl/Cmd + Enter para enviar</span>
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
