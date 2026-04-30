import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { name, trigger_event, trigger_filter, template_id, delay_minutes, is_active } = body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (trigger_event !== undefined) updates.trigger_event = trigger_event
  if (trigger_filter !== undefined) updates.trigger_filter = trigger_filter
  if (template_id !== undefined) updates.template_id = template_id
  if (delay_minutes !== undefined) updates.delay_minutes = delay_minutes
  if (is_active !== undefined) updates.is_active = is_active

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("email_automations")
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
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  const { error } = await supabase
    .from("email_automations")
    .delete()
    .eq("id", id)
    .eq("org_id", user.orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
