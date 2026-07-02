import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// POST /api/lancamentos/cards — cria um cartão no fim de uma lista. Story Lançamentos-03.
export async function POST(req: NextRequest) {
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { column_id?: string; title?: string } | null
  const columnId = body?.column_id
  const title = body?.title?.trim()
  if (!columnId || !title) return NextResponse.json({ error: "Lista e título obrigatórios" }, { status: 400 })

  // Valida que a lista é da org.
  const { data: col } = await admin
    .from("lancamento_columns")
    .select("id")
    .eq("id", columnId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!col) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })

  const { data: last } = await admin
    .from("lancamento_cards")
    .select("position")
    .eq("column_id", columnId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((last?.position as number | undefined) ?? -1) + 1

  const { data, error } = await admin
    .from("lancamento_cards")
    .insert({ org_id: appUser.org_id, column_id: columnId, title, position, created_by: appUser.id })
    .select("id, column_id, title, description, position")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ card: data })
}
