import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { EquipesManager } from "./_components/equipes-manager"
import type { FvsEquipe } from "@web/lib/fvs/fvs"

// FVS — cadastro de equipes executoras (Story 75-293, AC5).
export const dynamic = "force-dynamic"

export default async function FvsEquipesPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "fvs"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("fvs_equipes")
    .select("*")
    .eq("org_id", user.orgId)
    .order("nome")

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <EquipesManager equipes={(data ?? []) as FvsEquipe[]} />
    </div>
  )
}
