"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { LogoutButton } from "./logout-button"
import { ThemeToggle } from "@web/components/theme-toggle"

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
  /** Story 63-18 — tom do badge: 'orange' (default) ou 'green' (não-lidas do Chat, 63-19). */
  badgeTone?: 'orange' | 'green'
  separator?: boolean
  external?: boolean
}

interface SidebarNavProps {
  items: NavItem[]
  userName: string
  userRole: string
  basePath: string
  alertCount?: number
  /**
   * Story 75-223 — badge "vivo": o layout (server) congela em navegação
   * interna do App Router; este prop faz o item de `href` re-buscar a
   * contagem em `endpoint` (JSON `{ count }`) a cada 60s, ao focar a aba e a
   * cada mudança de rota. Falha de fetch mantém o último valor (fail-open).
   */
  liveBadge?: { href: string; endpoint: string }
}

/** Classe de background do badge numérico conforme `badgeTone`. */
function badgeBg(item: NavItem): string {
  return item.badgeTone === "green" ? "bg-green-700" : "bg-orange-500"
}

export function SidebarNav({ items, userName, userRole, basePath, alertCount, liveBadge }: SidebarNavProps) {
  const pathname = usePathname()
  // Story 63-18 — bottom sheet "Mais" (mobile).
  const [moreOpen, setMoreOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  // Story 75-223 — contagem viva do item apontado por `liveBadge`. Enquanto
  // null, vale o valor server-side do item (sem flash). O efeito depende do
  // pathname de propósito: cada navegação refaz o fetch na hora (é o gatilho
  // que zera o badge logo após abrir uma conversa) e reinicia o intervalo.
  const [liveCount, setLiveCount] = useState<number | null>(null)
  const liveEndpoint = liveBadge?.endpoint
  useEffect(() => {
    if (!liveEndpoint) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(liveEndpoint, { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { count?: unknown }
        if (!cancelled && typeof json.count === "number") setLiveCount(json.count)
      } catch {
        // fail-open: mantém o último valor conhecido
      }
    }
    void load()
    const interval = setInterval(() => void load(), 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [liveEndpoint, pathname])

  const badgeCount = (item: NavItem): number | undefined =>
    liveBadge && item.href === liveBadge.href && liveCount != null ? liveCount : item.badge

  const isActive = (href: string) => {
    if (href === basePath) return pathname === basePath
    return pathname.startsWith(href)
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  // Story 63-18 — itens visíveis no bottom bar mobile (4 tabs) vs. ocultos no "Mais".
  const tabItems = items.slice(0, 4)
  const moreItems = items.slice(4)
  const moreHasBadge = moreItems.some((i) => {
    const b = badgeCount(i)
    return b != null && b > 0
  })

  const closeMore = useCallback(() => {
    setMoreOpen(false)
    moreButtonRef.current?.focus()
  }, [])

  // Story 63-18 — focus-trap + Esc enquanto o sheet "Mais" está aberto.
  useEffect(() => {
    if (!moreOpen) return
    const sheet = sheetRef.current
    if (!sheet) return

    const focusable = sheet.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusable[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        closeMore()
        return
      }
      if (e.key === "Tab" && focusable.length > 0) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [moreOpen, closeMore])

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="max-lg:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-56 lg:flex-col">
        <div className="flex h-full flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
          {/* Logo */}
          <div className="flex h-20 shrink-0 items-center border-b border-stone-100 px-5 dark:border-stone-800">
            <Image
              src="/logo-trifold.webp"
              alt="Trifold"
              width={143}
              height={143}
              className="brightness-0 dark:brightness-0 dark:invert"
            />
          </div>

          {/* Nav Items — scrollable */}
          <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActive(item.href)
                const badge = badgeCount(item)
                return (
                  <li key={item.href}>
                    {item.separator && (
                      <div className="mx-1 mb-1.5 mt-1 border-t border-stone-100 dark:border-stone-800" />
                    )}
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                      >
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                          active
                            ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                            : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {badge != null && badge > 0 && !active && (
                          <span aria-hidden="true" className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full ${badgeBg(item)} px-1.5 text-[10px] font-bold text-white`}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                        {item.label === "Alertas" && alertCount != null && alertCount > 0 && !active && (
                          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                            {alertCount > 99 ? "99+" : alertCount}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* User */}
          <div className="shrink-0 border-t border-stone-100 p-3 dark:border-stone-800">
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                {initials}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-[13px] font-medium text-stone-900 dark:text-stone-100">{userName}</p>
                <p className="text-[11px] text-stone-400 capitalize dark:text-stone-500">{userRole}</p>
              </div>
              <ThemeToggle />
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur-sm lg:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex items-center gap-2">
          <Image
            src="/logo-trifold.webp"
            alt="Trifold"
            width={24}
            height={24}
            className="dark:brightness-0 dark:invert"
          />
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Trifold</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-[10px] font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
            {initials}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar — Story 63-18: 4 tabs + botão "Mais" */}
      <nav className="mobile-nav-safe fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-sm lg:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex items-center justify-around px-1 py-1">
          {tabItems.map((item) => {
            const active = isActive(item.href)
            const badge = badgeCount(item)
            const mobileClass = `flex min-w-[52px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors ${
              active ? "text-orange-600 dark:text-orange-300" : "text-stone-400 dark:text-stone-500"
            }`
            return item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={mobileClass}
              >
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={mobileClass}>
                <span className="relative flex h-5 w-5 items-center justify-center">
                  {item.icon}
                  {badge != null && badge > 0 && !active && (
                    <span aria-hidden="true" className={`absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full ${badgeBg(item)} px-1 text-[9px] font-bold text-white`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          {moreItems.length > 0 && (
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-h-[44px] min-w-[52px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-stone-400 dark:text-stone-500"
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <MoreHorizontal className="h-[18px] w-[18px]" />
                {moreHasBadge && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white dark:ring-stone-950" />
                )}
              </span>
              <span className="text-[10px] font-medium">Mais</span>
            </button>
          )}
        </div>
      </nav>

      {/* Story 63-18 — Bottom Sheet "Mais" (mobile only) */}
      {moreOpen && (
        <div className="lg:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={closeMore}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="mobile-nav-safe fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900"
          >
            <div className="mx-auto mt-3 mb-1 h-1 w-8 rounded-full bg-stone-300 dark:bg-stone-600" />
            <ul className="flex flex-col gap-0.5 p-3">
              {moreItems.map((item) => {
                const active = isActive(item.href)
                const badge = badgeCount(item)
                const rowClass = `flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                    : "text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800/60"
                }`
                return (
                  <li key={item.href}>
                    {item.separator && (
                      <div className="mx-1 mb-1 mt-1 border-t border-stone-100 dark:border-stone-800" />
                    )}
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className={rowClass}
                      >
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                      </a>
                    ) : (
                      <Link href={item.href} onClick={() => setMoreOpen(false)} className={rowClass}>
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {badge != null && badge > 0 && !active && (
                          <span aria-hidden="true" className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full ${badgeBg(item)} px-1.5 text-[10px] font-bold text-white`}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
