import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params
  const clienteId = new URL(req.url).searchParams.get("cliente_id")

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let query = supabase
    .from("obra_mensagens")
    .update({ read_at: new Date().toISOString() })
    .eq("obra_id", obra_id)
    .eq("sender_type", "cliente")
    .is("read_at", null)

  if (clienteId) query = query.eq("cliente_id", clienteId)

  const { data, error } = await query.select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: data?.length ?? 0 })
}
