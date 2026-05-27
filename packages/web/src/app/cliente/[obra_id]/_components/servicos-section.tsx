import Link from 'next/link'
import { FileText, BarChart3, Receipt } from 'lucide-react'

interface ServicosSectionProps {
  obraId: string
}

export function ServicosSection({ obraId }: ServicosSectionProps) {
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">Financeiro</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Boleto → sub-página financeiro/boleto */}
        <Link
          href={`/cliente/${obraId}/financeiro/boleto`}
          className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
        >
          <FileText className="h-6 w-6" />
          <span className="text-sm font-medium">Boleto</span>
        </Link>

        {/* Extrato → sub-página financeiro/extrato */}
        <Link
          href={`/cliente/${obraId}/financeiro/extrato`}
          className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
        >
          <BarChart3 className="h-6 w-6" />
          <span className="text-sm font-medium">Extrato</span>
        </Link>

        {/* Informe de Rendimentos → sub-página financeiro/informe */}
        <Link
          href={`/cliente/${obraId}/financeiro/informe`}
          className="flex flex-col items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/50 px-4 py-5 text-stone-400 transition-colors hover:border-stone-600 hover:bg-stone-800 hover:text-white"
        >
          <Receipt className="h-6 w-6" />
          <span className="text-sm font-medium">Informe de Rendimentos</span>
        </Link>
      </div>
    </div>
  )
}
