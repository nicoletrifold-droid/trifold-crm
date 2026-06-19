"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { BrokerMessageInput, type OptimisticMessage } from "./broker-message-input"
import { getBubbleStyle } from "./bubble-styles"
import { WindowStatusBadge } from "./window-status-badge"
import { ChatScrollArea } from "./chat-scroll-area"
import { mergeMessages, type ThreadMessage } from "./conversation-thread-merge"
import { getWindowStatus } from "@web/lib/broker/window-status"

interface ConversationThreadProps {
  /** Mensagens iniciais vindas do servidor (Server Component). */
  messages: ThreadMessage[]
  /** `id` é passado ao `BrokerMessageInput`; `phone`/`name` ficam disponíveis para exibição. */
  lead: { id: string; phone: string; name: string | null }
  /** `conversations.last_message_at` (ou null) — para `WindowStatusBadge` e janela de 24h. */
  lastMessageAt: Date | null
  /** Disponível para o banner da Story 63-8 (leitura apenas nesta story). */
  isAiActive: boolean
  /** false para canais sem restrição de janela (ex.: Telegram). */
  isWhatsApp: boolean
  /** Se o usuário atual pode enviar mensagens (gate de role do servidor). */
  canSend: boolean
  /**
   * Story 63-10 — estado inicial de `leads.metadata.notify_broker_on_reply`.
   * Repassado ao `BrokerMessageInput` para o caminho de saída quando a janela fecha.
   */
  notifyOnReply?: boolean
}

/**
 * Story 63-5 (Epic 63) — Componente unificado de conversa do corretor.
 *
 * Encapsula o painel de chat completo: header com `WindowStatusBadge`, área
 * rolável de mensagens (`ChatScrollArea`) com bolhas no padrão canônico da
 * Story 63-2 (`getBubbleStyle`), e o composer (`BrokerMessageInput`).
 *
 * O envio permanece INTERNO ao `BrokerMessageInput` (POST + `router.refresh()`).
 * Este componente gerencia a lista de mensagens otimistas (`useState`) e passa
 * `onSent` ao composer — sem callback de envio externo (contrato AC1).
 *
 * Layout (Story 63-6): full-height no mobile (`100dvh`), altura limitada no
 * desktop (`lg:h-[34rem]`), composer fixo no rodapé (`shrink-0`) com safe-area.
 */
export function ConversationThread({
  messages,
  lead,
  lastMessageAt,
  isWhatsApp,
  canSend,
  notifyOnReply = false,
}: ConversationThreadProps) {
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([])

  // Janela de 24h derivada internamente (antes computada em page.tsx).
  const windowClosed =
    getWindowStatus(lastMessageAt, isWhatsApp).status === "closed"

  const allMessages = mergeMessages(messages, optimistic)

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg bg-white shadow-sm lg:h-[34rem] dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-stone-800">
        <h2 className="text-lg font-semibold dark:text-stone-100">Conversa com o Agente</h2>
        <WindowStatusBadge lastMessageAt={lastMessageAt} isWhatsApp={isWhatsApp} />
      </div>

      {allMessages.length > 0 ? (
        <ChatScrollArea
          messageCount={allMessages.length}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-3">
            {allMessages.map((msg) => {
              const style = getBubbleStyle(msg.role)
              const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })

              if (style.side === "center") {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <p className={`max-w-[85%] text-center ${style.bubbleClass}`}>
                      {msg.content}
                    </p>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    style.side === "right" ? "items-end" : "items-start"
                  }`}
                >
                  {style.label && (
                    <span className="mb-0.5 px-1 text-xs text-stone-500 dark:text-stone-400">
                      {style.label}
                    </span>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${style.bubbleClass}`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span className="text-[10px] text-stone-500 dark:text-stone-400">
                        {time}
                      </span>
                      {msg.role === "broker" && (
                        <Check
                          className="h-3 w-3 text-stone-500 dark:text-stone-400"
                          aria-label="Enviado"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ChatScrollArea>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-gray-400 dark:text-stone-500">Nenhuma mensagem ainda.</p>
        </div>
      )}

      {canSend && (
        <div className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <BrokerMessageInput
            leadId={lead.id}
            disabledByWindow={windowClosed}
            notifyOnReply={notifyOnReply}
            onSent={(msg) => setOptimistic((prev) => [...prev, msg])}
          />
        </div>
      )}
    </div>
  )
}
