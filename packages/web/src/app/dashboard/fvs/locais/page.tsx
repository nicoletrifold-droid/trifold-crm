import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { LocaisManager } from "./_components/locais-manager"
import type { FvsLocal } from "@web/lib/fvs/fvs"

// FVS — cadastro de locais por obra (Story 75-293, AC3).
export const dynamic = "force-dynamic"

export default async function FvsLocaisPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "fvs"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data: obras } = await admin
    .from("obras")
    .select("id, name")
    .eq("org_id", user.orgId)
    .order("name")

  const { obra } = await searchParams
  const obraId = obra && obras?.some((o) => o.id === obra) ? obra : obras?.[0]?.id ?? null

  let locais: FvsLocal[] = []
  if (obraId) {
    // Paginação simples desde já: PostgREST corta em 1000 — 2 páginas cobrem
    // qualquer obra real (o Vind tem ~60 locais).
    const { data } = await admin
      .from("fvs_locais")
      .select("*")
      .eq("org_id", user.orgId)
      .eq("obra_id", obraId)
      .order("pavimento", { ascending: true, nullsFirst: false })
      .order("nome", { ascending: true })
      .range(0, 1999)
    locais = (data ?? []) as FvsLocal[]
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <LocaisManager
        obras={(obras ?? []) as { id: string; name: string }[]}
        obraId={obraId}
        locais={locais}
      />
    </div>
  )
}
