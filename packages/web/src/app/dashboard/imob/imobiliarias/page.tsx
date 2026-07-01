import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { ImobTabs } from "../_components/imob-tabs"
import { ImobiliariasManager } from "./_components/imobiliarias-manager"
import type { Imobiliaria } from "@web/lib/imob/imobiliarias"

// Story 75-92 — Cadastro de imobiliárias parceiras. Só admin/supervisor (igual ao módulo IMOB).
export const dynamic = "force-dynamic"

export default async function ImobiliariasPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
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
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">IMOB — Imobiliárias</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Cadastro dos parceiros — equipe, gerente e contato com a construtora.
        </p>
      </div>
      <ImobTabs />
      <ImobiliariasManager initial={imobiliarias} />
    </div>
  )
}
