import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "obras"])
  if (roleError) return roleError

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (body.nome !== undefined) {
    const nome = typeof body.nome === "string" ? body.nome.trim() : ""
    if (!nome) return NextResponse.json({ error: "nome não pode ser vazio" }, { status: 400 })
    updates.nome = nome
  }
  if (body.data !== undefined) {
    const data = typeof body.data === "string" ? body.data.trim() : ""
    if (!data) return NextResponse.json({ error: "data não pode ser vazia" }, { status: 400 })
    updates.data = data
  }
  if (body.ativa !== undefined) {
    updates.ativa = Boolean(body.ativa)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("datas_comemorativas")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ data })
}
