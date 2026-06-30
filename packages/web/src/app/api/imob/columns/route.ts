import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// POST /api/imob/columns — cria uma nova coluna (etapa) no fim do board. Story 75-88.
export async function POST(req: NextRequest) {
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { title?: string } | null
  const title = body?.title?.trim()
  if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 })

  const { data: last } = await admin
    .from("imob_columns")
    .select("position")
    .eq("org_id", appUser.org_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((last?.position as number | undefined) ?? -1) + 1

  const { data, error } = await admin
    .from("imob_columns")
    .insert({ org_id: appUser.org_id, title, position })
    .select("id, title, position")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ column: data })
}
