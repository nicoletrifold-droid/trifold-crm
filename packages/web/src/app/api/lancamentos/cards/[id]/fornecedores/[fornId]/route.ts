import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// DELETE — desvincula um fornecedor de um cartão. Story Lançamentos-07.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fornId: string }> }) {
  const { id, fornId } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { error } = await admin
    .from("lancamento_card_fornecedores")
    .delete()
    .eq("card_id", id)
    .eq("fornecedor_id", fornId)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
