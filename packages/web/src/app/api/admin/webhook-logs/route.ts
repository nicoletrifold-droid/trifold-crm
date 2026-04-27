import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(request: NextRequest) {
  const user = await getServerUser()

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Admin client bypasses RLS — necessário para ver todos os eventos incluindo org_id NULL
  const supabase = createAdminClient()
  const { searchParams } = request.nextUrl

  const source = searchParams.get("source")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)

  let query = supabase
    .from("webhook_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (source) {
    query = query.eq("source", source)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}
