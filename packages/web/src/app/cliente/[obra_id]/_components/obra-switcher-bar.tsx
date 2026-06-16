"use client"

import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"

interface ObraSwitcherBarProps {
  obraName: string
  numeroUnidade: string | null
  hasMultipleObras: boolean
}

export function ObraSwitcherBar({
  obraName,
  numeroUnidade,
  hasMultipleObras,
}: ObraSwitcherBarProps) {
  if (!hasMultipleObras) return null

  const label = numeroUnidade ? `${obraName} · ${numeroUnidade}` : obraName

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-800/50 bg-stone-950/90 px-4 py-2 backdrop-blur-sm lg:hidden">
      <p className="truncate text-[13px] font-medium text-stone-300">{label}</p>
      <Link
        href="/cliente/selecionar"
        className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-[#F27A5E] transition-colors active:bg-stone-800"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Trocar
      </Link>
    </div>
  )
}
