'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, BarChart3, Receipt, X } from 'lucide-react'

interface ServicosSectionProps {
  obraId: string
}

export function ServicosSection({ obraId }: ServicosSectionProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Serviços</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Boleto → página financeira */}
          <Link
            href={`/cliente/${obraId}/financeiro`}
            className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
          >
            <FileText className="h-6 w-6" />
            <span className="text-sm font-medium">Boleto</span>
          </Link>

          {/* Extrato → página financeira */}
          <Link
            href={`/cliente/${obraId}/financeiro`}
            className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
          >
            <BarChart3 className="h-6 w-6" />
            <span className="text-sm font-medium">Extrato</span>
          </Link>

          {/* Informe de Rendimentos → Em Breve (Sienge não possui endpoint) */}
          <button
            onClick={() => setOpen(true)}
            className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
          >
            <Receipt className="h-6 w-6" />
            <span className="text-sm font-medium">Informe de Rendimentos</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="em-breve-titulo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2
                id="em-breve-titulo"
                className="text-lg font-bold text-white"
              >
                Em breve
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-stone-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-6 text-sm text-stone-400">
              Esta funcionalidade estará disponível em breve. Aguarde novidades!
            </p>
            <button
              onClick={() => setOpen(false)}
              className="w-full rounded-xl bg-[#F27A5E] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
