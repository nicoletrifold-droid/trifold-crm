import { Boxes } from "lucide-react"

// Story 75-73 — Bolsão (placeholder) na área do corretor. Função a definir.
export default function BrokerBolsaoPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Bolsão</h1>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-700 py-20 text-center">
        <Boxes className="h-10 w-10 text-stone-500" />
        <p className="text-sm text-stone-400">Em breve — funcionalidade em definição.</p>
      </div>
    </div>
  )
}
