"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Home, Layers, Camera, FileText, MessageSquare, ChevronDown } from "lucide-react"
import { logout } from "@web/app/login/actions"

const NAV_ITEMS = [
  {
    label: "Visão Geral",
    href: (id: string) => `/cliente/${id}`,
    icon: Home,
    exact: true,
  },
  {
    label: "Fases da Obra",
    href: (id: string) => `/cliente/${id}/fases`,
    icon: Layers,
    exact: false,
  },
  {
    label: "Galeria de Fotos",
    href: (id: string) => `/cliente/${id}/fotos`,
    icon: Camera,
    exact: false,
  },
  {
    label: "Documentos",
    href: (id: string) => `/cliente/${id}/documentos`,
    icon: FileText,
    exact: false,
  },
  {
    label: "Mensagens",
    href: (id: string) => `/cliente/${id}/mensagens`,
    icon: MessageSquare,
    exact: false,
  },
]

interface SidebarProps {
  obraId: string
  userName: string
  userEmail: string
}

export function Sidebar({ obraId, userName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "U"

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[185px] flex-col border-r border-stone-800/40 bg-black lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image
          src="/logo-trifold.webp"
          alt="Trifold"
          width={26}
          height={26}
          className="rounded-sm"
        />
        <span className="text-[13px] font-bold uppercase tracking-widest text-white">
          Trifold
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
          const to = href(obraId)
          const isActive = exact ? pathname === to : pathname.startsWith(to)
          return (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-[#E8856A] text-white"
                  : "text-stone-400 hover:bg-stone-800/60 hover:text-stone-200"
              }`}
            >
              <Icon className="h-[15px] w-[15px] flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User / logout */}
      <div className="border-t border-stone-800/40 px-4 py-4">
        <form action={logout}>
          <button
            type="submit"
            title="Clique para sair"
            className="flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-stone-900/60"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-stone-700 text-[10px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-stone-200">
                {userName}
              </p>
              <p className="truncate text-[10px] text-stone-500">{userEmail}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-stone-500" />
          </button>
        </form>
      </div>
    </aside>
  )
}
