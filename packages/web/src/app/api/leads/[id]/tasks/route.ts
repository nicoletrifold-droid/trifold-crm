import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getServerUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("lead_tasks")
    .select("id, title, action_type, due_at, completed_at, source, created_at, assigned_to:users!assigned_to(id, name)")
    .eq("lead_id", id)
    .eq("org_id", user.orgId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getServerUser()
  const supabase = await createClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from("lead_tasks")
    .insert({
      org_id: user.orgId,
      lead_id: id,
      title: body.title,
      action_type: body.action_type ?? "outro",
      due_at: body.due_at ?? null,
      assigned_to: body.assigned_to ?? null,
      created_by: user.id,
      source: "manual",
    })
    .select("id, title, action_type, due_at, completed_at, source, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
