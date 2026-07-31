import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { syncFutureVisitsWithLeadOwner } from "@web/lib/appointments/sync-visit-owner"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor", "gerente-comercial", "sdr"])
  if (forbidden) return forbidden

  const body = await request.json()

  if (!body.broker_id) {
    return NextResponse.json(
      { error: "broker_id is required" },
      { status: 400 }
    )
  }

  // Verify the broker (user) exists in the same org
  const { data: brokerUser } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", body.broker_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!brokerUser) {
    return NextResponse.json(
      { error: "Broker not found in this organization" },
      { status: 404 }
    )
  }

  // Update the lead
  const { data: lead, error } = await supabase
    .from("leads")
    .update({ assigned_broker_id: body.broker_id })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Story 75-249 — 🔥 era AQUI que faltava: reatribuir o lead (Thielly → Matheus,
  // 31/07) deixava a visita com o corretor antigo, que receberia o lembrete do
  // dia seguinte. A visita vai para o novo responsável, tenha dono ou não.
  await syncFutureVisitsWithLeadOwner({
    admin: createAdminClient(),
    orgId: appUser.org_id,
    leadId: id,
    brokerUserId: body.broker_id,
    origem: "atribuição manual",
  })

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "broker_assigned",
    description: `Corretor ${brokerUser.name} atribuído ao lead`,
    metadata: {
      broker_id: body.broker_id,
      broker_name: brokerUser.name,
      assigned_by: appUser.id,
    },
  })

  return NextResponse.json({ data: lead })
}
