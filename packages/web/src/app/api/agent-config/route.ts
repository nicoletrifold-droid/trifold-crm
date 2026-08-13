import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: config, error } = await supabase
    .from("agent_config")
    .select("*")
    .eq("org_id", appUser.org_id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: config })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "nicole.personalidade_editar")
  if (roleError) return roleError

  const body = await request.json()

  const { fields: updateFields, error: payloadError } = buildUpdatePayload(body, [
    "personality_prompt",
    "greeting_message",
    "out_of_hours_message",
    "model_primary",
    "temperature",
    "max_tokens",
  ])

  if (payloadError) return payloadError

  const { data: config, error } = await supabase
    .from("agent_config")
    .update(updateFields)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error || !config) {
    return NextResponse.json(
      { error: "Config not found or update failed" },
      { status: 404 }
    )
  }

  return NextResponse.json({ data: config })
}
