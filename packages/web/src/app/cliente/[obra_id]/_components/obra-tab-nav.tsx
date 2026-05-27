"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Layers, FileText, MessageSquare, Wallet } from "lucide-react"
import { useUnreadBadge } from "./unread-badge-provider"

interface ObraTabNavProps {
  obraId: string
  /** @deprecated — use UnreadBadgeProvider context instead; kept for SSR initial render */
  unreadMensagens?: number
}

export function ObraTabNav({ obraId, unreadMensagens = 0 }: ObraTabNavProps) {
  const pathname = usePathname()
  const { unread: realtimeUnread } = useUnreadBadge()
  // Prefer live Realtime count; fall back to server-rendered initial value on first render
  const effectiveUnread = realtimeUnread !== 0 ? realtimeUnread : unreadMensagens

  const tabs = [
    {
      label: "Início",
      href: `/cliente/${obraId}`,
      icon: Home,
      exact: true,
    },
    {
      label: "Fases",
      href: `/cliente/${obraId}/fases`,
      icon: Layers,
      exact: false,
    },
    {
      label: "Financeiro",
      href: `/cliente/${obraId}/financeiro`,
      icon: Wallet,
      exact: false,
    },
    {
      label: "Docs",
      href: `/cliente/${obraId}/documentos`,
      icon: FileText,
      exact: false,
    },
    {
      label: "Chat",
      href: `/cliente/${obraId}/mensagens`,
      icon: MessageSquare,
      exact: false,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-stone-800 bg-stone-950 lg:hidden">
      <div className="mx-auto flex max-w-2xl">
        {tabs.map(({ label, href, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          const isChat = label === "Chat"
          const onMensagensPage = pathname.startsWith(`/cliente/${obraId}/mensagens`)
          const badge = isChat && !onMensagensPage && effectiveUnread > 0 ? effectiveUnread : 0
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 py-3.5 text-xs font-medium transition-colors ${
                isActive
                  ? "text-[#F27A5E]"
                  : "text-stone-500 hover:text-white"
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-[#F27A5E]"
                />
              )}
              <span className="relative">
                <Icon className="h-5 w-5" />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F27A5E] px-0.5 text-[9px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
