import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// PATCH (marcar/desmarcar ou editar texto) / DELETE de um item de checklist. Story Lançamentos-05.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { done?: boolean; text?: string } | null
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (typeof body.done === "boolean") patch.done = body.done
  if (typeof body.text === "string") {
    const t = body.text.trim()
    if (!t) return NextResponse.json({ error: "Texto não pode ser vazio" }, { status: 400 })
    patch.text = t
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada a atualizar" }, { status: 400 })

  const { error } = await admin
    .from("lancamento_card_checklist").update(patch).eq("id", itemId).eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { error } = await admin
    .from("lancamento_card_checklist").delete().eq("id", itemId).eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
