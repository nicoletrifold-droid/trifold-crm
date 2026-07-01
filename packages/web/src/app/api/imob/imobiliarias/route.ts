import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"
import { validateImobiliaria } from "@web/lib/imob/imobiliarias"

// POST /api/imob/imobiliarias — cria uma imobiliária parceira. Story 75-92.
export async function POST(req: NextRequest) {
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const parsed = validateImobiliaria(await req.json().catch(() => null), { partial: false })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("imobiliarias")
    .insert({ ...parsed.value, org_id: appUser.org_id, created_by: appUser.id })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliaria: data })
}
