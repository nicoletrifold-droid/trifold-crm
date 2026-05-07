"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Layers, Camera, FileText, MessageSquare } from "lucide-react"

interface ObraTabNavProps {
  obraId: string
}

export function ObraTabNav({ obraId }: ObraTabNavProps) {
  const pathname = usePathname()

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
      label: "Fotos",
      href: `/cliente/${obraId}/fotos`,
      icon: Camera,
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
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                isActive
                  ? "text-[#E8856A]"
                  : "text-stone-500 hover:text-stone-300"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${isActive ? "text-[#E8856A]" : ""}`}
              />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
