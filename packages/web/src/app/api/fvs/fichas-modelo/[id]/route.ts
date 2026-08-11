import { NextRequest, NextResponse } from "next/server"
import { fvsGuard } from "@web/lib/fvs/guard"
import { validateFichaModelo } from "@web/lib/fvs/fvs"

// PATCH /api/fvs/fichas-modelo/[id] — edita cabeçalho e/ou substitui os itens.
// Substituir itens em edição é seguro NA ETAPA 1: ainda não existem fichas
// preenchidas apontando para itens. Quando a etapa 2 entrar, edição de ficha
// com preenchimento vira "nova versão" (POST) — regra já garantida pelo índice
// parcial de 1 ativa por serviço.
// Sem DELETE de propósito: ficha se arquiva com { ativa: false }, nunca some.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const parsed = validateFichaModelo(await req.json().catch(() => null), { partial: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // A ficha precisa existir E ser da org (também precisamos do servico_id p/ reativação).
  const { data: existing } = await admin
    .from("fvs_fichas_modelo")
    .select("id, servico_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 })

  // Reativar esta ficha desativa a atual do mesmo serviço (1 ativa por serviço).
  if (parsed.value.header.ativa === true) {
    const { error: deactivateError } = await admin
      .from("fvs_fichas_modelo")
      .update({ ativa: false, updated_at: new Date().toISOString() })
      .eq("servico_id", existing.servico_id as string)
      .eq("org_id", appUser.org_id)
      .eq("ativa", true)
    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 })
    }
  }

  const { data: ficha, error } = await admin
    .from("fvs_fichas_modelo")
    .update({ ...parsed.value.header, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (parsed.value.itens) {
    const { error: delError } = await admin
      .from("fvs_ficha_modelo_itens")
      .delete()
      .eq("ficha_modelo_id", id)
      .eq("org_id", appUser.org_id)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    const rows = parsed.value.itens.map((it) => ({ ...it, ficha_modelo_id: id, org_id: appUser.org_id }))
    const { data: itens, error: insError } = await admin
      .from("fvs_ficha_modelo_itens")
      .insert(rows)
      .select("*")
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
    return NextResponse.json({ ficha, itens })
  }
  return NextResponse.json({ ficha })
}
