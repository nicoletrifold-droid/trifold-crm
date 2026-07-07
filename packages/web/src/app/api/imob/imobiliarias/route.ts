import { NextRequest, NextResponse } from "next/server"
import { imobiliariasGuard } from "@web/lib/imob/guard"
import { validateImobiliaria } from "@web/lib/imob/imobiliarias"

// GET /api/imob/imobiliarias — lista as imobiliárias da org (campos mínimos p/ seleção).
// Story 75-148 — usado pelos selects de Pastas (Nova pasta / Gerar link). Gate compartilhado
// (IMOB ou gestor de Pastas), pois a base é única para os dois módulos.
export async function GET() {
  const g = await imobiliariasGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("imobiliarias")
    .select("id, nome, cnpj, cidade, estado, status")
    .eq("org_id", appUser.org_id)
    .order("nome", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imobiliarias: data ?? [] })
}

// POST /api/imob/imobiliarias — cria uma imobiliária parceira. Story 75-92 / 75-148.
export async function POST(req: NextRequest) {
  const g = await imobiliariasGuard()
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
