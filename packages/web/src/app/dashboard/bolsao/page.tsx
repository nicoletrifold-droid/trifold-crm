import { Boxes } from "lucide-react"

// Story 75-73 — Bolsão (placeholder). Funcionalidade a definir; por ora só o
// menu/rota. Visível na sidebar para admin/gerente-comercial.
export default function BolsaoPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
        Bolsão
      </h1>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-20 text-center dark:border-stone-700">
        <Boxes className="h-10 w-10 text-stone-400 dark:text-stone-500" />
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Em breve — funcionalidade em definição.
        </p>
      </div>
    </div>
  )
}
