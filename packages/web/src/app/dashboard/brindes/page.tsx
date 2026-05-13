import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"
import { BrindesTable } from "./_components/brindes-table"
import type { DataComemorativa } from "./_components/types"

export default async function BrindesPage() {
  const user = await getServerUser()

  if (!["admin", "supervisor"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const [{ data: datas }, { data: obras }] = await Promise.all([
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
  ])

  const uniqueObras = [...new Set((obras ?? []).map((o: { obra_nome: string }) => o.obra_nome))].sort()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Controle de Brindes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie a entrega de brindes por data comemorativa
        </p>
      </div>

      <BrindesTable
        datas={(datas ?? []) as DataComemorativa[]}
        obraOptions={uniqueObras}
      />
    </div>
  )
}
