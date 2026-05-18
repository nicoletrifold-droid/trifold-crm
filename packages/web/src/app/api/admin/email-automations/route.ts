import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(_request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("email_automations")
    .select("id, name, trigger_event, trigger_filter, delay_minutes, is_active, created_at, email_templates(id, name, slug)")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json()
  const { name, trigger_event, trigger_filter, template_id, delay_minutes, is_active } = body as {
    name: string
    trigger_event: string
    trigger_filter?: Record<string, string>
    template_id: string
    delay_minutes?: number
    is_active?: boolean
  }

  if (!name || !trigger_event || !template_id) {
    return NextResponse.json({ error: "name, trigger_event e template_id são obrigatórios" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("email_automations")
    .insert({
      org_id: user.orgId,
      name,
      trigger_event,
      trigger_filter: trigger_filter ?? null,
      template_id,
      delay_minutes: delay_minutes ?? 0,
      is_active: is_active ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
