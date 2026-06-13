import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const PERDIDO_STAGE_IDS = [
  "00000000-0000-0000-0001-000000000008",
  "95327bd7-3e88-4038-aa16-250a74ab085c",
]
const ALLOWED_ACTIONS = ["ligacao", "whatsapp", "email", "visita", "outro"]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: notes, error } = await supabase
    .from("activities")
    .select("id, type, description, metadata, created_at, user_id, users:user_id(name)")
    .eq("lead_id", id)
    .eq("org_id", appUser.org_id)
    .in("type", ["broker_note", "note_added"])
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: notes })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const body = await request.json()
  const description = (body.description ?? body.content)?.trim()

  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 })
  }

  // Verify lead exists and isn't lost
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_broker_id, stage_id, lost_reason")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  if (lead.lost_reason || (lead.stage_id && PERDIDO_STAGE_IDS.includes(lead.stage_id as string))) {
    return NextResponse.json(
      { error: "Não é possível adicionar notas em leads perdidos" },
      { status: 400 }
    )
  }

  // admin/supervisor/gerente-comercial sempre podem; corretor só se atribuído ao lead
  if (
    !["admin", "supervisor", "gerente-comercial"].includes(appUser.role) &&
    lead.assigned_broker_id !== appUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const actionType = ALLOWED_ACTIONS.includes(body.action_type ?? "")
    ? (body.action_type as string)
    : "outro"

  // Nome do corretor para exibição consistente no drawer (compatível com supremo_contact)
  const { data: userRow } = await supabase
    .from("users")
    .select("name")
    .eq("id", appUser.id)
    .single()

  const { data: activity, error } = await supabase
    .from("activities")
    .insert({
      org_id: appUser.org_id,
      lead_id: id,
      user_id: appUser.id,
      type: "broker_note",
      description,
      metadata: {
        acao: actionType,
        corretor: userRow ? { nome: userRow.name } : null,
      },
    })
    .select("id, type, description, metadata, created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: activity }, { status: 201 })
}
