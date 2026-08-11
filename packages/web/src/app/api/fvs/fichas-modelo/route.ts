import { NextRequest, NextResponse } from "next/server"
import { fvsGuard } from "@web/lib/fvs/guard"
import { validateFichaModelo } from "@web/lib/fvs/fvs"

// POST /api/fvs/fichas-modelo — cria uma ficha-modelo COM seus itens.
// Body: { servico_id, titulo, foto_config?, itens: [{ descricao, tipo, unidade?, tolerancia? }] }
// Regra AC4: só 1 ficha ativa por serviço — a nova nasce ativa e desativa a anterior
// (a anterior NÃO é apagada, para não órfãar fichas preenchidas no futuro).
// O índice parcial uq_fvs_ficha_ativa_por_servico garante a regra também no banco.
export async function POST(req: NextRequest) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = validateFichaModelo(body, { partial: false })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const servicoId = typeof body?.servico_id === "string" ? body.servico_id : ""
  if (!servicoId) return NextResponse.json({ error: "servico_id é obrigatório" }, { status: 400 })

  // O serviço precisa existir E ser da org.
  const { data: servico } = await admin
    .from("fvs_servicos")
    .select("id")
    .eq("id", servicoId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!servico) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 })

  // Desativa a ficha ativa anterior ANTES do insert (índice parcial exige).
  const { error: deactivateError } = await admin
    .from("fvs_fichas_modelo")
    .update({ ativa: false, updated_at: new Date().toISOString() })
    .eq("servico_id", servicoId)
    .eq("org_id", appUser.org_id)
    .eq("ativa", true)
  if (deactivateError) {
    return NextResponse.json({ error: deactivateError.message }, { status: 500 })
  }

  const { data: ficha, error } = await admin
    .from("fvs_fichas_modelo")
    .insert({
      ...parsed.value.header,
      ativa: true,
      servico_id: servicoId,
      org_id: appUser.org_id,
      created_by: appUser.id,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itensRows = (parsed.value.itens ?? []).map((it) => ({
    ...it,
    ficha_modelo_id: ficha.id as string,
    org_id: appUser.org_id,
  }))
  const { data: itens, error: itensError } = await admin
    .from("fvs_ficha_modelo_itens")
    .insert(itensRows)
    .select("*")
  if (itensError) {
    // Best-effort cleanup: não deixar ficha sem itens (padrão createRole).
    await admin.from("fvs_fichas_modelo").delete().eq("id", ficha.id as string)
    return NextResponse.json({ error: itensError.message }, { status: 500 })
  }
  return NextResponse.json({ ficha, itens })
}
