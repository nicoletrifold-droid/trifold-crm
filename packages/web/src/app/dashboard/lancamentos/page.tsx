import { redirect } from "next/navigation"
import { Rocket } from "lucide-react"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"

// Épico Lançamentos — Story Lançamentos-01 (Fundação). Página inicial gated pelo
// módulo "lancamentos". Placeholder: o índice real (grid de lançamentos + criar)
// entra na Story Lançamentos-02. Mantém a rota navegável desde a fundação.
export const dynamic = "force-dynamic"

export default async function LancamentosPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "lancamentos"))) {
    redirect("/dashboard")
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
          Lançamentos
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Quadros de cada empreendimento em lançamento.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-20 text-center dark:border-stone-700">
        <Rocket className="h-9 w-9 text-stone-400" />
        <p className="text-sm text-stone-500 dark:text-stone-400">
          O módulo está sendo montado. Em breve você poderá criar lançamentos por aqui.
        </p>
      </div>
    </div>
  )
}
