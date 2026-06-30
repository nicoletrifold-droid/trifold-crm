import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// POST /api/imob/cards — cria um card no fim de uma coluna. Story 75-88.
export async function POST(req: NextRequest) {
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { column_id?: string; title?: string } | null
  const columnId = body?.column_id
  const title = body?.title?.trim()
  if (!columnId || !title) return NextResponse.json({ error: "Coluna e título obrigatórios" }, { status: 400 })

  // Valida que a coluna é da org.
  const { data: col } = await admin
    .from("imob_columns")
    .select("id")
    .eq("id", columnId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!col) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 })

  const { data: last } = await admin
    .from("imob_cards")
    .select("position")
    .eq("column_id", columnId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((last?.position as number | undefined) ?? -1) + 1

  const { data, error } = await admin
    .from("imob_cards")
    .insert({ org_id: appUser.org_id, column_id: columnId, title, position, created_by: appUser.id })
    .select("id, column_id, title, description, position")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ card: data })
}
