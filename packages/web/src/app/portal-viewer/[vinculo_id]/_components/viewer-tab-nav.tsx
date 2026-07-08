"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Layers, Camera, FileText, MessageSquare, Wallet } from "lucide-react"

// Story 78-1/78-4 — navegação do viewer (espelha as seções do portal do cliente, aponta
// para /portal-viewer/[vinculo_id]/... — rota full-screen fora do /dashboard). Leitura.
export function ViewerTabNav({ vinculoId }: { vinculoId: string }) {
  const pathname = usePathname()
  const base = `/portal-viewer/${vinculoId}`

  const tabs = [
    { label: "Início", href: base, icon: Home, exact: true },
    { label: "Fases", href: `${base}/fases`, icon: Layers, exact: false },
    { label: "Fotos", href: `${base}/fotos`, icon: Camera, exact: false },
    { label: "Docs", href: `${base}/documentos`, icon: FileText, exact: false },
    { label: "Chat", href: `${base}/mensagens`, icon: MessageSquare, exact: false },
    { label: "Financeiro", href: `${base}/financeiro`, icon: Wallet, exact: false },
  ]

  return (
    <nav className="mb-5 flex flex-wrap gap-1.5 rounded-xl border border-stone-800 bg-stone-900/60 p-1.5">
      {tabs.map(({ label, href, icon: Icon, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#F27A5E] text-white"
                : "text-stone-400 hover:bg-stone-800 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
