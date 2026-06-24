import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import type { AppUser } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"

// Quem pode gerenciar empreendimentos de um corretor — espelha o gate da página
// /dashboard/configuracoes/corretores (canAccess "corretores" | "sistema").
// Antes era requireRole(["admin"]), que divergia da página: gerente-comercial
// via o botão clicável mas a API devolvia 403 (clicava e não salvava).
async function canManageAssignments(appUser: AppUser): Promise<boolean> {
  return (
    (await canAccess(appUser.id, appUser.org_id, "corretores")) ||
    (await canAccess(appUser.id, appUser.org_id, "sistema"))
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brokerId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth

  const { data } = await supabase
    .from("broker_assignments")
    .select("broker_id, property_id, is_primary")
    .eq("broker_id", brokerId)

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brokerId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canManageAssignments(appUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { property_id } = body

  if (!property_id) {
    return NextResponse.json({ error: "property_id obrigatório" }, { status: 400 })
  }

  const { error } = await supabase.from("broker_assignments").upsert(
    { broker_id: brokerId, property_id, is_primary: true },
    { onConflict: "broker_id,property_id" }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { ok: true } })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brokerId } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canManageAssignments(appUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { property_id } = body

  await supabase
    .from("broker_assignments")
    .delete()
    .eq("broker_id", brokerId)
    .eq("property_id", property_id)

  return NextResponse.json({ data: { ok: true } })
}
