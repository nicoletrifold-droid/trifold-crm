"use client"

import Link from 'next/link'
import { FileText, BarChart3, Receipt, Clock } from 'lucide-react'
import { useState } from 'react'

interface ServicosSectionProps {
  obraId: string
}

export function ServicosSection({ obraId }: ServicosSectionProps) {
  const [showMsg, setShowMsg] = useState(false)

  function handleInformeClick() {
    setShowMsg(true)
    setTimeout(() => setShowMsg(false), 3500)
  }

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">Financeiro</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Boleto */}
        <Link
          href={`/cliente/${obraId}/financeiro/boleto`}
          className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
        >
          <FileText className="h-6 w-6" />
          <span className="text-sm font-medium">Boleto</span>
        </Link>

        {/* Extrato */}
        <Link
          href={`/cliente/${obraId}/financeiro/extrato`}
          className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
        >
          <BarChart3 className="h-6 w-6" />
          <span className="text-sm font-medium">Extrato</span>
        </Link>

        {/* Informe de Rendimentos — em breve */}
        <button
          onClick={handleInformeClick}
          className="relative flex flex-col items-center gap-2 rounded-xl border border-stone-700/50 bg-stone-800/30 px-4 py-5 text-stone-600 cursor-not-allowed"
        >
          <Receipt className="h-6 w-6" />
          <span className="text-sm font-medium">Informe de Rendimentos</span>
          <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-stone-700 px-2 py-0.5 text-[10px] font-semibold text-stone-300">
            <Clock className="h-2.5 w-2.5" />
            Em breve
          </span>
        </button>
      </div>

      {showMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-800 px-4 py-3 text-sm text-stone-300">
          <Clock className="h-4 w-4 shrink-0 text-stone-400" />
          O Informe de Rendimentos estará disponível em breve.
        </div>
      )}
    </div>
  )
}
