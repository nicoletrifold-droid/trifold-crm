import { NextRequest, NextResponse } from "next/server"
import { fvsGuard } from "@web/lib/fvs/guard"
import { validateEquipe } from "@web/lib/fvs/fvs"

// POST /api/fvs/equipes — cria uma equipe executora. Story 75-293 (AC5).
export async function POST(req: NextRequest) {
  const g = await fvsGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const parsed = validateEquipe(await req.json().catch(() => null), { partial: false })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("fvs_equipes")
    .insert({ ...parsed.value, org_id: appUser.org_id })
    .select("*")
    .single()
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Já existe uma equipe com esse nome" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ equipe: data })
}
