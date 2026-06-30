import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// PATCH (editar título/descrição) / DELETE de um card. Story 75-88.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { title?: string; description?: string } | null
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === "string") {
    const t = body.title.trim()
    if (!t) return NextResponse.json({ error: "Título não pode ser vazio" }, { status: 400 })
    patch.title = t
  }
  if (typeof body.description === "string") patch.description = body.description

  const { error } = await admin
    .from("imob_cards")
    .update(patch)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { error } = await admin
    .from("imob_cards")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
