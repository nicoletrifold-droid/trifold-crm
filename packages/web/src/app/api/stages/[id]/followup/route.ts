import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: rule, error } = await supabase
    .from("follow_up_rules")
    .select("*")
    .eq("stage_id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: rule })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "configuracoes.pipeline_followup")
  if (forbidden) return forbidden

  const body = await request.json()

  // Validate alert_days < nicole_takeover_days
  const alertDays = body.alert_days
  const nicoleDays = body.nicole_takeover_days

  if (
    alertDays !== undefined &&
    nicoleDays !== undefined &&
    alertDays >= nicoleDays
  ) {
    return NextResponse.json(
      { error: "alert_days must be less than nicole_takeover_days" },
      { status: 400 }
    )
  }

  // Build update fields
  const allowedFields = [
    "alert_days",
    "nicole_takeover_days",
    "message_template",
    "is_active",
  ]
  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  // If only one of alert/nicole is being updated, validate against existing value
  const { data: existing } = await supabase
    .from("follow_up_rules")
    .select("alert_days, nicole_takeover_days")
    .eq("stage_id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (existing) {
    const finalAlert =
      fields.alert_days !== undefined
        ? (fields.alert_days as number)
        : existing.alert_days
    const finalNicole =
      fields.nicole_takeover_days !== undefined
        ? (fields.nicole_takeover_days as number)
        : existing.nicole_takeover_days

    if (finalAlert >= finalNicole) {
      return NextResponse.json(
        { error: "alert_days must be less than nicole_takeover_days" },
        { status: 400 }
      )
    }
  }

  // Upsert: create if not exists, update if exists
  const { data: rule, error } = await supabase
    .from("follow_up_rules")
    .upsert(
      {
        org_id: appUser.org_id,
        stage_id: id,
        ...fields,
      },
      { onConflict: "org_id,stage_id" }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: rule })
}
