import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { triggerAutomations } from "@web/lib/email-automations"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const body = await request.json()

  if (!body.stage_id) {
    return NextResponse.json(
      { error: "stage_id is required" },
      { status: 400 }
    )
  }

  // Get current lead with current stage
  const { data: lead } = await supabase
    .from("leads")
    .select("id, stage_id, stage:kanban_stages!stage_id(id, name)")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Verify new stage exists
  const { data: newStage } = await supabase
    .from("kanban_stages")
    .select("id, name")
    .eq("id", body.stage_id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!newStage) {
    return NextResponse.json({ error: "Stage not found" }, { status: 404 })
  }

  const fromStageArr = lead.stage as unknown as Array<{
    id: string
    name: string
  }> | null
  const fromStage = fromStageArr?.[0] ?? null

  // Update lead stage
  const { data: updatedLead, error: updateError } = await supabase
    .from("leads")
    .update({ stage_id: body.stage_id })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (updateError || !updatedLead) {
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    )
  }

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "stage_change",
    description: `Etapa alterada de "${fromStage?.name ?? "Nenhuma"}" para "${newStage.name}"`,
    metadata: {
      from_stage: fromStage
        ? { id: fromStage.id, name: fromStage.name }
        : null,
      to_stage: { id: newStage.id, name: newStage.name },
    },
  })

  void triggerAutomations("lead.status_changed", {
    id: updatedLead.id,
    email: (updatedLead.email as string | null) ?? null,
    name: (updatedLead.name as string | null) ?? null,
    phone: (updatedLead.phone as string | null) ?? null,
    org_id: appUser.org_id,
  }, { status: newStage.name })

  return NextResponse.json({ data: updatedLead })
}
