import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Get brokers with user info and active lead count
  const { data: brokers, error } = await supabase
    .from("brokers")
    .select(
      `
      id, creci, type, is_available, max_leads, created_at,
      user:users!user_id(id, name, email, avatar_url, is_active)
    `
    )
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get active lead counts per broker (assigned_broker_id references users.id)
  const userIds = (brokers ?? [])
    .map((b) => {
      const u = b.user as unknown as { id: string } | null
      return u?.id
    })
    .filter(Boolean) as string[]

  let leadCounts: Record<string, number> = {}

  if (userIds.length > 0) {
    const { data: counts } = await supabase
      .from("leads")
      .select("assigned_broker_id")
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .in("assigned_broker_id", userIds)

    if (counts) {
      leadCounts = counts.reduce(
        (acc, lead) => {
          const brokerId = lead.assigned_broker_id as string
          acc[brokerId] = (acc[brokerId] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
    }
  }

  const brokersWithCounts = (brokers ?? []).map((b) => {
    const u = b.user as unknown as { id: string } | null
    return {
      ...b,
      active_leads_count: u ? leadCounts[u.id] || 0 : 0,
    }
  })

  return NextResponse.json({ data: brokersWithCounts })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const body = await request.json()

  // If creating a new broker with email/password (full creation flow)
  if (body.email && body.password && body.name) {
    const adminSupabase = createAdminClient()

    // Step 1: Create auth user
    const { data: authData, error: authError } =
      await adminSupabase.auth.admin.createUser({
        email: body.email.trim(),
        password: body.password,
        email_confirm: true,
      })

    if (authError) {
      return NextResponse.json(
        { error: `Erro ao criar usuario: ${authError.message}` },
        { status: 400 }
      )
    }

    const authUser = authData.user

    // Step 2: Create users table row
    const phone: string | null = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null

    const { data: newUser, error: userError } = await adminSupabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        org_id: appUser.org_id,
        name: body.name.trim(),
        email: body.email.trim(),
        role: "broker",
        is_active: true,
        ...(phone ? { phone } : {}),
      })
      .select("id")
      .single()

    if (userError) {
      // Rollback: delete auth user if users insert fails
      await adminSupabase.auth.admin.deleteUser(authUser.id)
      return NextResponse.json(
        { error: `Erro ao criar usuario: ${userError.message}` },
        { status: 500 }
      )
    }

    // Step 3: Create broker record
    const { data: broker, error: brokerError } = await adminSupabase
      .from("brokers")
      .insert({
        org_id: appUser.org_id,
        user_id: newUser.id,
        creci: body.creci?.trim() || null,
        type: body.type || "internal",
        max_leads: body.max_leads ?? 50,
        is_available: true,
      })
      .select()
      .single()

    if (brokerError) {
      return NextResponse.json(
        { error: `Erro ao criar corretor: ${brokerError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: broker }, { status: 201 })
  }

  // Legacy flow: link existing user as broker via user_id
  if (!body.user_id) {
    return NextResponse.json(
      { error: "user_id or (email, password, name) is required" },
      { status: 400 }
    )
  }

  // Verify the user exists and belongs to the same org
  const { data: targetUser } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("id", body.user_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!targetUser) {
    return NextResponse.json(
      { error: "User not found in this organization" },
      { status: 404 }
    )
  }

  // Check if broker record already exists
  const { data: existing } = await supabase
    .from("brokers")
    .select("id")
    .eq("user_id", body.user_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "Broker record already exists for this user" },
      { status: 409 }
    )
  }

  const { data: broker, error } = await supabase
    .from("brokers")
    .insert({
      org_id: appUser.org_id,
      user_id: body.user_id,
      creci: body.creci?.trim() || null,
      type: body.type || "internal",
      max_leads: body.max_leads ?? 50,
      is_available: body.is_available ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: broker }, { status: 201 })
}
