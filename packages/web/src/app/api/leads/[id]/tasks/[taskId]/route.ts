import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  const user = await getServerUser()
  const supabase = await createClient()
  const body = await req.json()

  const updates: Record<string, unknown> = {}
  if ("completed" in body) {
    updates.completed_at = body.completed ? new Date().toISOString() : null
    updates.completed_by = body.completed ? user.id : null
  }
  if ("title" in body) updates.title = body.title
  if ("due_at" in body) updates.due_at = body.due_at
  if ("action_type" in body) updates.action_type = body.action_type

  const { data, error } = await supabase
    .from("lead_tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("lead_id", id)
    .eq("org_id", user.orgId)
    .select("id, title, action_type, due_at, completed_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  const user = await getServerUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from("lead_tasks")
    .delete()
    .eq("id", taskId)
    .eq("lead_id", id)
    .eq("org_id", user.orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
