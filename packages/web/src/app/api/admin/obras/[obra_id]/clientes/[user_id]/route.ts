import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string; user_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, user_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("cliente_obras")
    .delete()
    .eq("user_id", user_id)
    .eq("obra_id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; user_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, user_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const numero_unidade =
    typeof body.numero_unidade === "string" && body.numero_unidade.trim()
      ? body.numero_unidade.trim()
      : null

  const { error } = await supabase
    .from("cliente_obras")
    .update({ numero_unidade })
    .eq("user_id", user_id)
    .eq("obra_id", obra_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ numero_unidade })
}
