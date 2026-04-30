import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

function getStartOfDayBRT(): Date {
  const now = new Date()
  const start = new Date(now)
  start.setUTCHours(3, 0, 0, 0)
  if (now.getUTCHours() < 3) start.setUTCDate(start.getUTCDate() - 1)
  return start
}

export async function GET(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = request.nextUrl
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)
  const status = searchParams.get("status")
  const templateId = searchParams.get("template_id")
  const period = searchParams.get("period")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const search = searchParams.get("search")

  const supabase = createAdminClient()

  let query = supabase
    .from("email_logs")
    .select(
      "id, to_email, to_name, subject, status, sent_at, created_at, template_id, error_message, email_templates(name)",
      { count: "exact" }
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== "all") query = query.eq("status", status)
  if (templateId) query = query.eq("template_id", templateId)
  if (search) query = query.ilike("to_email", `%${search}%`)

  if (period === "today") {
    query = query.gte("created_at", getStartOfDayBRT().toISOString())
  } else if (period === "7d") {
    query = query.gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  } else if (period === "30d") {
    query = query.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  } else if (from && to) {
    query = query.gte("created_at", from).lte("created_at", to)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}
