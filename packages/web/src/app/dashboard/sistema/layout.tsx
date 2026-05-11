"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Mail } from "lucide-react"

const EMAIL_TABS = [
  { href: "/dashboard/sistema/emails", label: "Monitoramento" },
  { href: "/dashboard/sistema/email-templates", label: "Templates" },
  { href: "/dashboard/sistema/email-automacoes", label: "Automações" },
  { href: "/dashboard/sistema/email-blasts", label: "Disparos" },
]

function EmailMarketingNav({ pathname }: { pathname: string }) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-stone-400">
        <Link href="/dashboard/sistema" className="hover:text-stone-600 transition-colors">
          Sistema
        </Link>
        <span>›</span>
        <div className="flex items-center gap-1">
          <Mail className="h-3 w-3" />
          <span className="font-medium text-stone-600">Email Marketing</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-stone-200">
        {EMAIL_TABS.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-orange-500 text-orange-700"
                  : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300"
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
