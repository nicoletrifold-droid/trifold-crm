import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { LancamentosManager } from "./_components/lancamentos-manager"
import type { Lancamento } from "@web/lib/lancamentos/lancamentos"

// Épico Lançamentos — Story Lançamentos-02. Índice: grid de lançamentos (cada um abre seu board).
// Tabela lancamentos tem RLS sem policy → leitura via admin client após o gate do módulo.
export const dynamic = "force-dynamic"

type Row = Lancamento & { properties?: { name: string | null } | null }

export default async function LancamentosPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "lancamentos"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const [{ data: lancData }, { data: propData }] = await Promise.all([
    admin
      .from("lancamentos")
      .select("*, properties:property_interest_id(name)")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false }),
    admin
      .from("properties")
      .select("id, name")
      .eq("org_id", user.orgId)
      .order("name", { ascending: true }),
  ])

  const lancamentos: Lancamento[] = ((lancData ?? []) as Row[]).map((r) => ({
    ...r,
    empreendimento_nome: r.properties?.name ?? null,
  }))
  const empreendimentos = (propData ?? []) as { id: string; name: string }[]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <LancamentosManager initial={lancamentos} empreendimentos={empreendimentos} />
    </div>
  )
}
