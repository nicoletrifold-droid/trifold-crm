import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const isAdmin = appUser.role === "admin" || appUser.role === "supervisor"
  if (!isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json() as {
    status?: string
    admin_response?: string
  }

  const VALID_STATUS = ["aberto", "em_analise", "resolvido"]
  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.status) {
    update.status = body.status
    if (body.status === "resolvido") {
      update.resolved_at = new Date().toISOString()
    }
  }
  if (typeof body.admin_response === "string") {
    update.admin_response = body.admin_response.trim() || null
    update.responded_at = body.admin_response.trim() ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from("chamados")
    .update(update)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("id, status, admin_response, responded_at, resolved_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chamado: data })
}
