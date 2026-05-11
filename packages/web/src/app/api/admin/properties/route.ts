import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const semObra = searchParams.get("sem_obra") === "true"

  if (semObra) {
    const { data: linked } = await supabase
      .from("obras")
      .select("property_id")
      .not("property_id", "is", null)
      .eq("org_id", appUser.org_id)

    const linkedIds = (linked ?? [])
      .map((o) => o.property_id as string)
      .filter(Boolean)

    let query = supabase
      .from("properties")
      .select("id, name, city, state")
      .eq("is_active", true)
      .order("name")

    if (linkedIds.length > 0) {
      query = query.not("id", "in", `(${linkedIds.join(",")})`)
    }

    const { data: properties, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ properties: properties ?? [] })
  }

  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, name, city, state")
    .eq("is_active", true)
    .order("name")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ properties: properties ?? [] })
}
