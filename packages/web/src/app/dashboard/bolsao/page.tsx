import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { BolsaoList, type BolsaoLead } from "@web/components/bolsao/bolsao-list"

// Story 75-81 (Epic 64) — Bolsão no dashboard (gestor): visão do pool (read-only).
export const dynamic = "force-dynamic"

type RawLead = {
  id: string
  name: string | null
  phone: string | null
  bolsao_em: string
  properties: { name: string } | { name: string }[] | null
}

function normalize(l: RawLead): BolsaoLead {
  const prop = Array.isArray(l.properties) ? l.properties[0] : l.properties
  return { id: l.id, name: l.name, phone: l.phone, bolsao_em: l.bolsao_em, property_name: prop?.name ?? null }
}

export default async function BolsaoPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, bolsao_em, properties:property_interest_id(name)")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .not("bolsao_em", "is", null)
    .is("assigned_broker_id", null) // Story 75-89: só pool real (sem dono) — nunca "fantasma"
    .order("bolsao_em", { ascending: true })
    .limit(200)

  const leads = ((data ?? []) as unknown as RawLead[]).map(normalize)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Bolsão</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Leads sem atendimento que caíram no bolsão. Qualquer corretor habilitado pode pegá-los.
      </p>
      <BolsaoList initialLeads={leads} orgId={user.orgId} canPull={false} />
    </div>
  )
}
