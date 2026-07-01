import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { ImobTabs } from "../_components/imob-tabs"
import { ImobLeadsManager, type ImobLead } from "./_components/imob-leads-manager"

// Story 75-99 — Leads do mundo IMOB (segmento='imob'). Só quem tem acesso ao módulo IMOB.
export const dynamic = "force-dynamic"

type RawLead = {
  id: string; name: string | null; phone: string | null; email: string | null
  ai_summary: string | null; created_at: string
  stage: { name: string; color: string | null } | { name: string; color: string | null }[] | null
  properties: { name: string } | { name: string }[] | null
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ImobLeadsPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const [{ data: leadsData }, { data: propsData }] = await Promise.all([
    admin
      .from("leads")
      .select("id, name, phone, email, ai_summary, created_at, stage:kanban_stages!stage_id(name, color), properties:property_interest_id(name)")
      .eq("org_id", user.orgId)
      .eq("segmento", "imob")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("properties").select("id, name").eq("org_id", user.orgId).eq("is_active", true).order("name"),
  ])

  const leads: ImobLead[] = ((leadsData ?? []) as RawLead[]).map((l) => {
    const stage = one(l.stage)
    const prop = one(l.properties)
    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email,
      observacao: l.ai_summary, created_at: l.created_at,
      stage_name: stage?.name ?? null, stage_color: stage?.color ?? null,
      property_name: prop?.name ?? null,
    }
  })
  const properties = (propsData ?? []) as { id: string; name: string }[]

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">IMOB — Leads</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Leads do mundo IMOB (cadastro manual). Isolados do funil principal.
        </p>
      </div>
      <ImobTabs />
      <ImobLeadsManager initial={leads} properties={properties} />
    </div>
  )
}
