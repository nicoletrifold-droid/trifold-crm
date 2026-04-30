import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, category, subject, html_body, variables, is_active, slug } = body

  const supabase = createAdminClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (category !== undefined) updates.category = category
  if (subject !== undefined) updates.subject = subject
  if (html_body !== undefined) updates.html_body = html_body
  if (variables !== undefined) updates.variables = variables
  if (is_active !== undefined) updates.is_active = is_active
  if (slug !== undefined) updates.slug = slug

  const { data, error } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id)
    .eq("org_id", user.orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const supabase = createAdminClient()

  // Soft delete — preserves email_logs FK
  const { error } = await supabase
    .from("email_templates")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
