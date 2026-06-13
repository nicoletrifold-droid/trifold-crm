import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("roleta_config")
    .select("*")
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (!["admin", "supervisor", "gerente-comercial"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const allowed = [
    "is_active",
    "business_days",
    "business_hour_start",
    "business_hour_end",
    "weekend_hour_start",
    "weekend_hour_end",
    "timezone",
    "notify_push",
    "notify_email",
    "notify_whatsapp",
    "priorizar_lead_ativo",
    "max_leads_per_day",
    "notify_user_on_distribution",
    "notify_user_on_fora_horario",
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = (body as Record<string, unknown>)[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("roleta_config")
    .upsert(
      { org_id: appUser.org_id, ...patch },
      { onConflict: "org_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: data })
}
