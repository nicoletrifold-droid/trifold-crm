import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: obras, error } = await supabase
    .from("obras")
    .select("id, name, status, progress_pct, expected_delivery_date")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ obras: obras ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    name?: unknown
    description?: unknown
    expected_delivery_date?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    return NextResponse.json(
      { error: "O campo 'name' é obrigatório" },
      { status: 400 }
    )
  }

  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null

  const expectedDeliveryDate =
    typeof body.expected_delivery_date === "string" &&
    body.expected_delivery_date.length > 0
      ? body.expected_delivery_date
      : null

  const { data: obra, error } = await supabase
    .from("obras")
    .insert({
      org_id: appUser.org_id,
      name,
      description,
      expected_delivery_date: expectedDeliveryDate,
      status: "em_andamento",
      progress_pct: 0,
    })
    .select("id, name, status, progress_pct")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ obra }, { status: 201 })
}
