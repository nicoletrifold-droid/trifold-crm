import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { FornecedoresManager } from "./_components/fornecedores-manager"
import type { Fornecedor } from "@web/lib/lancamentos/fornecedores"

// Épico Lançamentos — Story Lançamentos-06. Cadastro global de fornecedores.
export const dynamic = "force-dynamic"

export default async function FornecedoresPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "lancamentos"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("fornecedores")
    .select("*")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <FornecedoresManager initial={(data ?? []) as Fornecedor[]} />
    </div>
  )
}
