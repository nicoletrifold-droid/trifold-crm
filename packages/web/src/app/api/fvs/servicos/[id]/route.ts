import { NextRequest, NextResponse } from "next/server"
import { fvsGuard } from "@web/lib/fvs/guard"
import { validateServico } from "@web/lib/fvs/fvs"

// PATCH / DELETE de um serviço. Story 75-293 (AC4).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const parsed = validateServico(await req.json().catch(() => null), { partial: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("fvs_servicos")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("*")
    .single()
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Já existe um serviço com esse nome" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ servico: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  // Cascade: fichas-modelo e itens do serviço vão junto (FK ON DELETE CASCADE).
  // Aceitável na etapa 1 — ainda não existem fichas PREENCHIDAS referenciando nada.
  const { error } = await admin.from("fvs_servicos").delete().eq("id", id).eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
