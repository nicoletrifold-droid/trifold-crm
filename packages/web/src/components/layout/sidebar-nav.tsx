"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LogoutButton } from "./logout-button"
import { ThemeToggle } from "@web/components/theme-toggle"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
  separator?: boolean
  external?: boolean
}

interface SidebarNavProps {
  items: NavItem[]
  userName: string
  userRole: string
  basePath: string
  alertCount?: number
}

export function SidebarNav({ items, userName, userRole, basePath, alertCount }: SidebarNavProps) {
  const pathname = usePathname()

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

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-56 lg:flex-col">
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
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActive(item.href)
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
                        {item.badge != null && item.badge > 0 && !active && (
                          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        )}
                        {item.label === "Alertas" && alertCount != null && alertCount > 0 && (
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

      {/* Mobile Bottom Tab Bar */}
      <nav className="mobile-nav-safe fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-sm lg:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex items-center justify-around px-1 py-1">
          {items.slice(0, 5).map((item) => {
            const active = isActive(item.href)
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
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          {items[5] && (
            <Link
              href={items[5].href}
              className="flex min-w-[52px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-stone-400 dark:text-stone-500"
            >
              <span className="text-lg">...</span>
              <span className="text-[10px] font-medium">Mais</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  )
}
