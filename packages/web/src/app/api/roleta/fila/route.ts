import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("roleta_fila")
    .select("id, position, is_active, broker_id, brokers(id, user_id, users(name, email, phone))")
    .eq("org_id", appUser.org_id)
    .order("position", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ fila: data ?? [] })
}

// Upsert (add or update position) of a broker in the queue
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (!["admin", "supervisor"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const brokerId = typeof body?.broker_id === "string" ? (body.broker_id as string) : null

  if (!brokerId) {
    return NextResponse.json({ error: "broker_id obrigatório" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get max position in this org
  const { data: existing } = await admin
    .from("roleta_fila")
    .select("position")
    .eq("org_id", appUser.org_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = ((existing?.position as number) ?? -1) + 1

  const { data, error } = await admin
    .from("roleta_fila")
    .upsert(
      {
        org_id: appUser.org_id,
        broker_id: brokerId,
        position: nextPosition,
        is_active: true,
      },
      { onConflict: "org_id,broker_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entry: data }, { status: 201 })
}

// Toggle is_active for a fila entry
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (!["admin", "supervisor"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const entryId = typeof body?.id === "string" ? (body.id as string) : null
  const isActive = typeof body?.is_active === "boolean" ? (body.is_active as boolean) : null

  if (!entryId || isActive === null) {
    return NextResponse.json({ error: "id e is_active obrigatórios" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("roleta_fila")
    .update({ is_active: isActive })
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entry: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (!["admin", "supervisor"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const entryId = searchParams.get("id")

  if (!entryId) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("roleta_fila")
    .delete()
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
