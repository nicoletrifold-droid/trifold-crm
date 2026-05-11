import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const { data: obra, error } = await supabase
    .from("obras")
    .select("id, name, status, progress_pct")
    .eq("property_id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ obra: obra ?? null })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { obra_id } = body as { obra_id: string }

  if (!obra_id) {
    return NextResponse.json({ error: "obra_id é obrigatório" }, { status: 400 })
  }

  const { data: obra } = await supabase
    .from("obras")
    .select("id, property_id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  if (obra.property_id && obra.property_id !== id) {
    return NextResponse.json(
      { error: "Obra já vinculada a outro empreendimento" },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from("obras")
    .update({ property_id: id })
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: updated } = await supabase
    .from("obras")
    .select("id, name, status, progress_pct")
    .eq("id", obra_id)
    .single()

  return NextResponse.json({ obra: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const { error } = await supabase
    .from("obras")
    .update({ property_id: null })
    .eq("property_id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
