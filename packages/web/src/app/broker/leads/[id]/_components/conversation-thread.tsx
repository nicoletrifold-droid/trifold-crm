"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { BrokerMessageInput, type OptimisticMessage } from "./broker-message-input"
import { getBubbleStyle, resolveBubbleLabel } from "./bubble-styles"
import { WindowStatusBadge } from "./window-status-badge"
import { AiStatusBanner } from "./ai-status-banner"
import { ChatScrollArea } from "./chat-scroll-area"
import { mergeMessages, type ThreadMessage } from "./conversation-thread-merge"
import { MessageMedia } from "@web/components/conversas/message-media"
import {
  dedupeById,
  hasStaleRealtime,
  pruneRealtime,
} from "./conversation-thread-realtime"
import { getWindowStatus } from "@web/lib/broker/window-status"
import { neverHadConversation } from "@web/lib/broker/conversation-state"
import { deriveBrokerActive } from "@web/lib/broker/broker-takeover-status"
import { createClient } from "@web/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { MessageText } from "@web/components/ui/message-text"

/** Story 63-11 — máximo de canais Realtime simultâneos (R3). Leads com mais de
 *  3 conversas recebem realtime apenas das 3 mais recentes. */
const MAX_REALTIME_CHANNELS = 3

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
  /**
   * Story 63-11 — ids das conversas do lead (já computados em `page.tsx`). Um
   * canal Supabase Realtime é criado por id (cap em {@link MAX_REALTIME_CHANNELS})
   * para receber INSERTs de `messages` sem reload.
   */
  conversationIds?: string[]
  /** Story 75-165 — id do espectador: bolha do corretor mostra "Você" só se for ele. */
  currentUserId?: string | null
  /** Story 75-165 — mapa sent_by → nome, p/ rotular bolhas de outros corretores. */
  senderNames?: Record<string, string>
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
  isAiActive,
  isWhatsApp,
  canSend,
  notifyOnReply = false,
  conversationIds = [],
  currentUserId = null,
  senderNames = {},
}: ConversationThreadProps) {
  const router = useRouter()
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([])

  // Story 63-14 — estado local de `is_ai_active` para transição instantânea do
  // banner (Estado B → A) ao clicar "Devolver para Nicole", sem aguardar o
  // `router.refresh()`. Sincroniza quando o prop muda (pós-refresh do servidor).
  const [localIsAiActive, setLocalIsAiActive] = useState(isAiActive)
  useEffect(() => {
    setLocalIsAiActive(isAiActive)
  }, [isAiActive])

  // Story 63-14 — devolve o atendimento à Nicole. Atualiza o estado local
  // imediatamente (banner transiciona) e dispara `router.refresh()` para
  // sincronizar com o servidor. Lança em falha → o `AiStatusBanner` captura
  // no try/catch e restaura o botão.
  const handleResumeAi = async () => {
    const res = await fetch(`/api/leads/${lead.id}/resume-ai`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(`resume-ai failed: ${res.status}`)
    setLocalIsAiActive(true)
    router.refresh()
  }

  // Story 63-11 — mensagens recebidas via Supabase Realtime (lead respondeu /
  // Nicole respondeu / corretor enviou em outra aba), antes de o `router.refresh()`
  // incorporá-las ao prop `messages`.
  const [realtimeMessages, setRealtimeMessages] = useState<ThreadMessage[]>([])
  // `localLastMessageAt` reabre a janela de 24h sem reload quando o lead responde.
  const [localLastMessageAt, setLocalLastMessageAt] = useState<Date | null>(
    lastMessageAt
  )

  // Story 63-11 — quando o prop `messages` muda (após `router.refresh()`),
  // remove de `realtimeMessages` o que já foi incorporado pelo servidor. Evita
  // que a fonte-de-verdade diverja e que keys dupliquem entre as duas listas.
  useEffect(() => {
    setRealtimeMessages((prev) =>
      hasStaleRealtime(prev, messages) ? pruneRealtime(prev, messages) : prev
    )
  }, [messages])

  // Story 63-11 — um canal Realtime por conversa (postgres_changes não suporta
  // IN). Cobre `role='user'` (lead) e `role='assistant'` (Nicole). Cap em 3
  // canais (R3). Cleanup remove todos os canais no unmount (AC8).
  //
  // FIX de auth (Story 63-11): o socket Realtime do `createBrowserClient`
  // (anon key) NÃO é autenticado por padrão, então a RLS de `messages`
  // (`auth.uid()`) filtra TODOS os eventos e nada chega. Antes de subscrever,
  // obtemos a sessão e chamamos `realtime.setAuth(access_token)` para que o
  // canal carregue o JWT do corretor e a RLS libere os INSERTs.
  useEffect(() => {
    const ids = conversationIds.slice(0, MAX_REALTIME_CHANNELS)
    if (ids.length === 0) return

    const supabase = createClient()
    let cancelled = false
    let channels: RealtimeChannel[] = []

    void (async () => {
      // Autentica o socket Realtime ANTES de subscrever — sem o JWT a RLS
      // de `messages` bloqueia todos os eventos (bug-alvo).
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token)
      }
      // O efeito pode ter sido desmontado durante o await: não subscreva.
      if (cancelled) return

      channels = ids.map((convId) =>
        supabase
          .channel(`broker-chat-${convId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${convId}`,
            },
            (payload) => {
              const incoming = payload.new as ThreadMessage
              setRealtimeMessages((prev) =>
                prev.some((m) => m.id === incoming.id)
                  ? prev
                  : [...prev, incoming]
              )
              // AC6 — mensagem do lead reabre a janela de 24h sem reload.
              if (incoming.role === "user") {
                setLocalLastMessageAt(new Date(incoming.created_at))
              }
              // Auto-scroll (AC5) é tratado pelo `ChatScrollArea` quando o número
              // de mensagens renderizadas muda — não precisa de ref aqui.
            }
          )
          .subscribe((status, err) => {
            // Diagnóstico leve: só loga falhas (não polui em SUBSCRIBED).
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("[realtime]", convId, status, err?.message)
            }
          })
      )
    })()

    return () => {
      cancelled = true
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
    // `conversationIds` é estável entre re-renders (vem do Server Component);
    // a chave evita re-subscribe desnecessário em renders disparados por state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIds.slice(0, MAX_REALTIME_CHANNELS).join(",")])

  // Lista combinada servidor + realtime, deduplicada por id (servidor prevalece).
  const serverPlusRealtime = dedupeById([...messages, ...realtimeMessages])

  // Janela de 24h derivada de `localLastMessageAt` (reage ao inbound realtime).
  const windowClosed =
    getWindowStatus(localLastMessageAt, isWhatsApp).status === "closed"

  // Story 63-8 — estado do banner read-only: corretor assumiu (envio <24h) ou
  // handoff manual de admin (is_ai_active=false). Fonte de verdade do takeover
  // é a mesma do cron de follow-up (brokerSentRecently), não o is_ai_active.
  // Story 63-11 — usa a lista combinada: se um `role='broker'` chega de outra
  // aba, o banner transiciona Estado A → Estado B sem reload (AC7).
  const brokerActive = deriveBrokerActive(serverPlusRealtime, localIsAiActive)

  const allMessages = mergeMessages(serverPlusRealtime, optimistic)

  // Story 75-267 — lead que NUNCA teve conversa (thread vazia + sem
  // last_message_at): o composer troca "aguarde o lead" por convite à abertura.
  // Usa a lista combinada e o estado local: a primeira mensagem (realtime ou
  // otimista) já tira o composer desse estado sem reload.
  const neverHad = neverHadConversation(allMessages.length, localLastMessageAt)

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg bg-white shadow-sm lg:h-[calc(100dvh-13rem)] lg:max-h-[52rem] lg:min-h-[34rem] dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="shrink-0 border-b border-gray-100 dark:border-stone-800">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <h2 className="text-lg font-semibold dark:text-stone-100">Conversa com o Agente</h2>
          <WindowStatusBadge lastMessageAt={localLastMessageAt} isWhatsApp={isWhatsApp} />
        </div>
        <div className="px-5 pb-3">
          <AiStatusBanner brokerActive={brokerActive} onResumeAi={handleResumeAi} />
        </div>
      </div>

      {allMessages.length > 0 ? (
        <ChatScrollArea
          messageCount={allMessages.length}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-3">
            {allMessages.map((msg) => {
              const style = getBubbleStyle(msg.role)
              const label = resolveBubbleLabel(msg, { currentUserId, senderNames })
              const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })

              if (style.side === "center") {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <MessageText
                      content={msg.content}
                      className={`max-w-[85%] text-center ${style.bubbleClass}`}
                    />
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
                  {label && (
                    <span className="mb-0.5 px-1 text-xs text-stone-500 dark:text-stone-400">
                      {label}
                    </span>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${style.bubbleClass}`}
                  >
                    <MessageText content={msg.content} className="whitespace-pre-line" />
                    <MessageMedia
                      mediaType={msg.metadata?.media_type as string | undefined}
                      mediaUrl={msg.metadata?.media_url as string | undefined}
                    />
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
            neverHadConversation={neverHad}
            notifyOnReply={notifyOnReply}
            onSent={(msg) => setOptimistic((prev) => [...prev, msg])}
          />
        </div>
      )}
    </div>
  )
}
