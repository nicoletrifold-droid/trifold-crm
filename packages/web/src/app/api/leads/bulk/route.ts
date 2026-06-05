import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { STAGE_IDS } from "@trifold/shared"

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  const isAdmin = await canAccess(user.id, user.orgId, "sistema")
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { lead_ids, broker_id, lost_reason } = body as {
    lead_ids: string[]
    broker_id?: string | null
    lost_reason?: string | null
  }

  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return NextResponse.json({ error: "lead_ids obrigatório" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Montar payload de atualização
  const update: Record<string, unknown> = { updated_at: now }

  if (broker_id !== undefined) {
    update.assigned_broker_id = broker_id || null
  }

  if (lost_reason) {
    update.lost_reason = lost_reason
    update.stage_id = STAGE_IDS.perdido
  }

  const { error, count } = await supabase
    .from("leads")
    .update(update)
    .eq("org_id", user.orgId)
    .in("id", lead_ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: count ?? lead_ids.length })
}
