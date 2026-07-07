import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { isPastaManager } from "@web/lib/pastas/roles"
import { ImobiliariasManager } from "../../imob/imobiliarias/_components/imobiliarias-manager"
import type { Imobiliaria } from "@web/lib/imob/imobiliarias"

// Story 75-148 — cadastro de imobiliárias DENTRO do módulo Pastas. Mesma base (`imobiliarias`)
// e mesmo componente do IMOB, mas gateado por isPastaManager → perfis que só têm Pastas (sem
// acesso ao módulo IMOB) conseguem listar/criar/editar imobiliária.
export const dynamic = "force-dynamic"

export default async function PastasImobiliariasPage() {
  const user = await getServerUser()
  if (!isPastaManager(user.role)) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("imobiliarias")
    .select("*")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  const imobiliarias = (data ?? []) as Imobiliaria[]

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <div className="mb-4 shrink-0">
        <Link
          href="/dashboard/pastas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para Pastas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Imobiliárias</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Cadastro dos parceiros — usado nas pastas e nos links de auto-cadastro.
        </p>
      </div>
      <ImobiliariasManager initial={imobiliarias} />
    </div>
  )
}
