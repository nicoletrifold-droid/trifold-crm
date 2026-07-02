import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"
import { validateFornecedor } from "@web/lib/lancamentos/fornecedores"

// POST /api/lancamentos/fornecedores — cria um fornecedor (cadastro global). Story Lançamentos-06.
export async function POST(req: NextRequest) {
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const parsed = validateFornecedor(await req.json().catch(() => null), { partial: false })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("fornecedores")
    .insert({ ...parsed.value, org_id: appUser.org_id, created_by: appUser.id })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fornecedor: data })
}
