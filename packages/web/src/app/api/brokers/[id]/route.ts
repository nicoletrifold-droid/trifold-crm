import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { buildUpdatePayload } from "@web/lib/api-utils"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth

  const { data: broker } = await supabase
    .from("brokers")
    .select("id, creci, type, is_available, max_leads, user:users!user_id(id, name, email, phone, is_active)")
    .eq("id", id)
    .single()

  if (!broker) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const brokerUser = Array.isArray(broker.user) ? broker.user[0] : broker.user

  return NextResponse.json({ data: { ...broker, user: brokerUser } })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "gerente-comercial"])
  if (forbidden) return forbidden

  const body = await request.json()

  const allowedFields = ["creci", "type", "is_available", "max_leads"]
  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  const { data: broker, error } = await supabase
    .from("brokers")
    .update(fields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select(
      `
      id, creci, type, is_available, max_leads, created_at,
      user:users!user_id(id, name, email, avatar_url)
    `
    )
    .single()

  if (error || !broker) {
    return NextResponse.json({ error: "Broker not found" }, { status: 404 })
  }

  return NextResponse.json({ data: broker })
}
