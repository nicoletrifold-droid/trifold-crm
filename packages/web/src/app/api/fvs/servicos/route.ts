import { NextRequest, NextResponse } from "next/server"
import { fvsGuard } from "@web/lib/fvs/guard"
import { validateServico } from "@web/lib/fvs/fvs"

// POST /api/fvs/servicos — cria um serviço. Story 75-293 (AC4).
export async function POST(req: NextRequest) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const parsed = validateServico(await req.json().catch(() => null), { partial: false })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("fvs_servicos")
    .insert({ ...parsed.value, org_id: appUser.org_id })
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
