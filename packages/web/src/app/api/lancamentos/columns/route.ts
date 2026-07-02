import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// POST /api/lancamentos/columns — cria uma lista (coluna) no fim do board de um lançamento.
// Story Lançamentos-03. Body: { lancamento_id, title }.
export async function POST(req: NextRequest) {
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { lancamento_id?: string; title?: string } | null
  const lancamentoId = body?.lancamento_id
  const title = body?.title?.trim()
  if (!lancamentoId || !title) return NextResponse.json({ error: "Lançamento e título obrigatórios" }, { status: 400 })

  // Valida que o lançamento é da org.
  const { data: lanc } = await admin
    .from("lancamentos")
    .select("id")
    .eq("id", lancamentoId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!lanc) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 })

  const { data: last } = await admin
    .from("lancamento_columns")
    .select("position")
    .eq("lancamento_id", lancamentoId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((last?.position as number | undefined) ?? -1) + 1

  const { data, error } = await admin
    .from("lancamento_columns")
    .insert({ org_id: appUser.org_id, lancamento_id: lancamentoId, title, position })
    .select("id, title, position")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ column: data })
}
