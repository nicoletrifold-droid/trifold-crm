import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"
import { ImobTabs } from "../_components/imob-tabs"
import { ImobLeadsManager, type ImobLead } from "./_components/imob-leads-manager"

// Story 75-99 — Leads do mundo IMOB (segmento='imob'). Só quem tem acesso ao módulo IMOB.
// Story 75-297 — views "Em atendimento" / "Perdidos" (mesma régua da house: perdido = ETAPA
// em PERDIDO_STAGE_IDS), com reativação na view de perdidos.
export const dynamic = "force-dynamic"

type RawLead = {
  id: string; name: string | null; phone: string | null; email: string | null
  ai_summary: string | null; created_at: string; assigned_broker_id: string | null
  stage: { name: string; color: string | null } | { name: string; color: string | null }[] | null
  properties: { name: string } | { name: string }[] | null
  responsavel: { name: string | null } | { name: string | null }[] | null
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ImobLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
    redirect("/dashboard")
  }

  const params = await searchParams
  const view = params.view === "perdidos" ? "perdidos" : "ativos"
  const perdidosFilter = `(${PERDIDO_STAGE_IDS.join(",")})`

  const admin = createAdminClient()

  // Base das queries de leads do IMOB (lista da view atual + contagem de cada view).
  const baseLeads = () =>
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId).eq("segmento", "imob").eq("is_active", true)

  let leadsQuery = admin
    .from("leads")
    .select("id, name, phone, email, ai_summary, created_at, assigned_broker_id, stage:kanban_stages!stage_id(name, color), properties:property_interest_id(name), responsavel:assigned_broker_id(name)")
    .eq("org_id", user.orgId)
    .eq("segmento", "imob")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)
  leadsQuery = view === "perdidos"
    ? leadsQuery.in("stage_id", PERDIDO_STAGE_IDS)
    : leadsQuery.not("stage_id", "in", perdidosFilter)

  const [{ data: leadsData }, { count: ativosCount }, { count: perdidosCount }, { data: propsData }, { data: usersData }] = await Promise.all([
    leadsQuery,
    baseLeads().not("stage_id", "in", perdidosFilter),
    baseLeads().in("stage_id", PERDIDO_STAGE_IDS),
    admin.from("properties").select("id, name").eq("org_id", user.orgId).eq("is_active", true).order("name"),
    // Responsáveis possíveis: qualquer usuário interno ativo (exceto cliente do portal).
    admin.from("users").select("id, name").eq("org_id", user.orgId).eq("is_active", true).neq("role", "cliente").order("name"),
  ])

  const leads: ImobLead[] = ((leadsData ?? []) as RawLead[]).map((l) => {
    const stage = one(l.stage)
    const prop = one(l.properties)
    const resp = one(l.responsavel)
    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email,
      observacao: l.ai_summary, created_at: l.created_at,
      stage_name: stage?.name ?? null, stage_color: stage?.color ?? null,
      property_name: prop?.name ?? null,
      assigned_broker_id: l.assigned_broker_id,
      responsavel_name: resp?.name ?? null,
    }
  })
  const properties = (propsData ?? []) as { id: string; name: string }[]
  const users = ((usersData ?? []) as { id: string; name: string | null }[]).map((u) => ({
    id: u.id, name: u.name ?? "—",
  }))

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">IMOB — Leads</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Leads do mundo IMOB (cadastro manual). Isolados do funil principal.
        </p>
      </div>
      <ImobTabs />
      <ImobLeadsManager
        initial={leads}
        properties={properties}
        users={users}
        view={view}
        counts={{ ativos: ativosCount ?? 0, perdidos: perdidosCount ?? 0 }}
      />
    </div>
  )
}
