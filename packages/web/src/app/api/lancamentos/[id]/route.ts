import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"
import { validateLancamento } from "@web/lib/lancamentos/lancamentos"

// PATCH /api/lancamentos/[id] — edita um lançamento. Story Lançamentos-02.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const parsed = validateLancamento(await req.json().catch(() => null), { partial: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("lancamentos")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lancamento: data })
}

// DELETE /api/lancamentos/[id] — remove um lançamento (o board/cartões caem por CASCADE nas stories seguintes).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const { error } = await admin
    .from("lancamentos")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
