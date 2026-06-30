import { redirect } from "next/navigation"
import { Handshake } from "lucide-react"
import { getServerUser } from "@web/lib/auth"

// Story 75-87 — Módulo IMOB (placeholder): imobiliárias externas que ajudam na venda
// dos empreendimentos. Função a definir (novas diretrizes do usuário). Só admin/supervisor.
export default async function ImobPage() {
  const user = await getServerUser()
  if (user.role !== "admin" && user.role !== "supervisor") {
    redirect("/dashboard")
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">IMOB</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Imobiliárias externas — parceiras na venda dos empreendimentos.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-20 text-center dark:border-stone-700">
        <Handshake className="h-10 w-10 text-stone-400 dark:text-stone-500" />
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Em breve — funcionalidade em definição.
        </p>
      </div>
    </div>
  )
}
