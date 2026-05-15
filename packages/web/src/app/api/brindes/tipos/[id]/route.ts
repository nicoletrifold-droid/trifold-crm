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

  const { data: existing } = await supabase
    .from("brindes_tipos")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Tipo de brinde não encontrado" }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.nome === "string" && body.nome.trim()) {
    updates.nome = body.nome.trim()
  }
  if (body.descricao !== undefined) {
    updates.descricao = typeof body.descricao === "string" && body.descricao.trim()
      ? body.descricao.trim()
      : null
  }
  if (body.tamanho !== undefined) {
    updates.tamanho = typeof body.tamanho === "string" && body.tamanho.trim()
      ? body.tamanho.trim()
      : null
  }
  if (body.cor !== undefined) {
    updates.cor = typeof body.cor === "string" && body.cor.trim() ? body.cor.trim() : null
  }
  if (typeof body.ativo === "boolean") {
    updates.ativo = body.ativo
  }

  const { data, error } = await supabase
    .from("brindes_tipos")
    .update(updates)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe um tipo com esse nome" },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "obras"])
  if (roleError) return roleError

  const { id } = await params

  const { data: existing } = await supabase
    .from("brindes_tipos")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Tipo de brinde não encontrado" }, { status: 404 })
  }

  const { count } = await supabase
    .from("brindes_entregas")
    .select("id", { count: "exact", head: true })
    .eq("brinde_tipo_id", id)
    .eq("org_id", appUser.org_id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Este tipo está em uso em ${count} entrega(s). Desative-o ao invés de deletar.` },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from("brindes_tipos")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
