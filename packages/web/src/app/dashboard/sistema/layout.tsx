"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Mail } from "lucide-react"

const EMAIL_TABS = [
  { href: "/dashboard/sistema/emails", label: "Monitoramento" },
  { href: "/dashboard/sistema/email-templates", label: "Templates" },
  { href: "/dashboard/sistema/email-automacoes", label: "Automações" },
  { href: "/dashboard/sistema/email-blasts", label: "Disparos" },
  { href: "/dashboard/sistema/email-envio-rapido", label: "Envio Rápido" },
  { href: "/dashboard/sistema/email-configuracoes", label: "Configurações" },
]

function EmailMarketingNav({ pathname }: { pathname: string }) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-stone-400">
        <Link href="/dashboard/sistema" className="transition-colors hover:text-stone-600 dark:hover:text-stone-200">
          Sistema
        </Link>
        <span>›</span>
        <div className="flex items-center gap-1">
          <Mail className="h-3 w-3" />
          <span className="font-medium text-stone-600 dark:text-stone-300">Email Marketing</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-stone-200 dark:border-stone-800">
        {EMAIL_TABS.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-orange-500 text-orange-700 dark:text-orange-400"
                  : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-900 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-100"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isEmailSection = EMAIL_TABS.some((tab) => pathname.startsWith(tab.href))

  return (
    <div>
      {isEmailSection && <EmailMarketingNav pathname={pathname} />}
      {children}
    </div>
  )
}
