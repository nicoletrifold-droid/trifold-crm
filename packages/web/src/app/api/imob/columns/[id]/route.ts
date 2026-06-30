import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// PATCH (renomear) / DELETE (excluir + cards em cascata) de uma coluna. Story 75-88.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { title?: string } | null
  const title = body?.title?.trim()
  if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 })

  const { error } = await admin
    .from("imob_columns")
    .update({ title })
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

  // Cards caem em cascata (FK on delete cascade).
  const { error } = await admin
    .from("imob_columns")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
