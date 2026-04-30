import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function uniqueSlug(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = base
  let counter = 2
  while (true) {
    let query = supabase
      .from("email_templates")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
    if (excludeId) query = query.neq("id", excludeId)
    const { data } = await query.maybeSingle()
    if (!data) return slug
    slug = `${base}-${counter++}`
  }
}

export async function GET(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { searchParams } = request.nextUrl
  const category = searchParams.get("category")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)

  let query = supabase
    .from("email_templates")
    .select("id, name, slug, category, is_active, created_at, variables", { count: "exact" })
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (category && category !== "all") {
    query = query.eq("category", category)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { name, category, subject, html_body, variables, is_active, slug: rawSlug } = body

  if (!name || !category || !subject || !html_body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const baseSlug = rawSlug ? slugify(rawSlug) : slugify(name)
  const slug = await uniqueSlug(supabase, user.orgId, baseSlug)

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      org_id: user.orgId,
      name,
      slug,
      category,
      subject,
      html_body,
      variables: variables ?? [],
      is_active: is_active ?? false,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
