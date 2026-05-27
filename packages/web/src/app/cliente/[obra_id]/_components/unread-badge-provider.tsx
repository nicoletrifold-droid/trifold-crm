"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@web/lib/supabase/client"

interface UnreadBadgeContextValue {
  unread: number
  clearUnread: () => void
}

const UnreadBadgeContext = createContext<UnreadBadgeContextValue>({
  unread: 0,
  clearUnread: () => {},
})

export function useUnreadBadge() {
  return useContext(UnreadBadgeContext)
}

interface UnreadBadgeProviderProps {
  obraId: string
  userId: string
  initialUnread: number
  children: React.ReactNode
}

/**
 * Mantém o contador de mensagens não lidas em tempo real via Supabase Realtime.
 * Quando o admin envia uma mensagem enquanto o cliente está em outra aba do portal,
 * o badge incrementa automaticamente sem precisar recarregar a página.
 */
export function UnreadBadgeProvider({
  obraId,
  userId,
  initialUnread,
  children,
}: UnreadBadgeProviderProps) {
  const [unread, setUnread] = useState(initialUnread)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`unread-badge-${obraId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "obra_mensagens",
          filter: `obra_id=eq.${obraId}`,
        },
        (payload) => {
          const nova = payload.new as {
            sender_type: string
            cliente_id: string | null
            read_at: string | null
          }
          // Só incrementar para mensagens da equipe endereçadas a este cliente
          if (nova.sender_type === "equipe" && nova.cliente_id === userId && !nova.read_at) {
            // Não mostrar badge se o usuário já está na página de mensagens
            if (!window.location.pathname.includes("/mensagens")) {
              setUnread((prev) => prev + 1)
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "obra_mensagens",
          filter: `obra_id=eq.${obraId}`,
        },
        (payload) => {
          const updated = payload.new as {
            sender_type: string
            cliente_id: string | null
            read_at: string | null
          }
          // Quando read_at é preenchido (usuário abriu o chat), zerar o badge
          if (
            updated.sender_type === "equipe" &&
            updated.cliente_id === userId &&
            updated.read_at
          ) {
            setUnread(0)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [obraId, userId])

  function clearUnread() {
    setUnread(0)
  }

  return (
    <UnreadBadgeContext.Provider value={{ unread, clearUnread }}>
      {children}
    </UnreadBadgeContext.Provider>
  )
}
