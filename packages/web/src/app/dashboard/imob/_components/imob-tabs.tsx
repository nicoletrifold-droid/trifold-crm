"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Story 75-92 — navegação do módulo IMOB. Vai crescer conforme novas funções.
const TABS = [
  { href: "/dashboard/imob", label: "Kanban" },
  { href: "/dashboard/imob/imobiliarias", label: "Imobiliárias" },
]

export function ImobTabs() {
  const pathname = usePathname()
  return (
    <nav className="mb-4 flex gap-1 border-b border-stone-200 dark:border-stone-800">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-orange-500 text-stone-900 dark:text-white"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
