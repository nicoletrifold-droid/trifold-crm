import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"
import { BrindesTable } from "./_components/brindes-table"
import type { BrindeTipo, DataComemorativa } from "./_components/types"

export default async function BrindesPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "brindes"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const [{ data: datas }, { data: obras }, { data: tipos }] = await Promise.all([
    supabase
      .from("datas_comemorativas")
      .select("id, nome, data, ativa")
      .eq("org_id", user.orgId)
      .eq("ativa", true)
      .order("data"),
    supabase
      .from("brindes_destinatarios")
      .select("obra_nome")
      .eq("org_id", user.orgId),
    supabase
      .from("brindes_tipos")
      .select("id, nome, descricao, tamanho, cor, ativo")
      .eq("org_id", user.orgId)
      .order("nome"),
  ])

  const uniqueObras = [...new Set((obras ?? []).map((o: { obra_nome: string }) => o.obra_nome))].sort()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Controle de Brindes</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Gerencie a entrega de brindes por data comemorativa
        </p>
      </div>

      <BrindesTable
        datas={(datas ?? []) as DataComemorativa[]}
        tipos={(tipos ?? []) as BrindeTipo[]}
        obraOptions={uniqueObras}
      />
    </div>
  )
}
