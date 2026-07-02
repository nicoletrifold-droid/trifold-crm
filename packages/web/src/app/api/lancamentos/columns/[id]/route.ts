import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// PATCH (renomear) / DELETE (excluir + cards em cascata) de uma lista. Story Lançamentos-03.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { title?: string } | null
  const title = body?.title?.trim()
  if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 })

  const { error } = await admin
    .from("lancamento_columns")
    .update({ title })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { error } = await admin
    .from("lancamento_columns")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
