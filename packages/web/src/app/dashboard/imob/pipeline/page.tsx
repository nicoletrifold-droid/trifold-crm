import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { KanbanBoard, type InitialStageState } from "@web/components/pipeline/kanban-board"
import { ImobTabs } from "../_components/imob-tabs"

// Story 75-99 — Pipeline do mundo IMOB (mesmas etapas, só leads segmento='imob').
export const dynamic = "force-dynamic"

const PAGE_SIZE = 50
const LEADS_SELECT = `id, name, phone, stage_id, qualification_score, interest_level,
       property_interest_id, assigned_broker_id, created_at, updated_at,
       ai_summary, source, utm_campaign, utm_content, metadata,
       properties:property_interest_id(name),
       users:assigned_broker_id(name)`

type RawLead = Record<string, unknown>
function normalizeLead(l: RawLead) {
  return {
    ...l,
    properties: Array.isArray(l.properties) ? (l.properties[0] ?? null) : (l.properties ?? null),
    users: Array.isArray(l.users) ? (l.users[0] ?? null) : (l.users ?? null),
  }
}

export default async function ImobPipelinePage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const { data: stages } = await admin
    .from("kanban_stages")
    .select("id, name, slug, color, position")
    .eq("is_active", true)
    .order("position")
  const stagesList = (stages ?? []) as Array<{ id: string; name: string; slug: string; color: string; position: number }>

  const perStage = await Promise.all(
    stagesList.map(async (stage) => {
      const { data, count } = await admin
        .from("leads")
        .select(LEADS_SELECT, { count: "exact" })
        .eq("org_id", user.orgId)
        .eq("segmento", "imob")
        .eq("is_active", true)
        .eq("stage_id", stage.id)
        .is("lost_reason", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
      const rows = (data ?? []) as RawLead[]
      const totalCount = count ?? rows.length
      return { stage_id: stage.id, leads: rows.map(normalizeLead), totalCount, hasMore: totalCount > rows.length }
    })
  )

  const initialLeadsPerStage = perStage as unknown as InitialStageState[]
  const total = perStage.reduce((acc, s) => acc + s.totalCount, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">IMOB — Pipeline</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{total} leads no funil do IMOB</p>
      </div>
      <ImobTabs />
      <KanbanBoard initialStages={stagesList} initialLeadsPerStage={initialLeadsPerStage} segmento="imob" />
    </div>
  )
}
