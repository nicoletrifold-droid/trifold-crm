import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// GET (fornecedores vinculados a um cartão) / POST (vincular). Story Lançamentos-07.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("lancamento_card_fornecedores")
    .select("fornecedor_id, fornecedor:fornecedores!fornecedor_id(id, nome, categoria, status)")
    .eq("card_id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fornecedores = ((data ?? []) as Array<{ fornecedor: { id: string; nome: string; categoria: string | null; status: string } | { id: string; nome: string; categoria: string | null; status: string }[] | null }>)
    .map((r) => (Array.isArray(r.fornecedor) ? r.fornecedor[0] : r.fornecedor))
    .filter((f): f is { id: string; nome: string; categoria: string | null; status: string } => !!f)
  return NextResponse.json({ fornecedores })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { fornecedor_id?: string } | null
  const fornecedorId = body?.fornecedor_id
  if (!fornecedorId) return NextResponse.json({ error: "fornecedor_id obrigatório" }, { status: 400 })

  // Valida card e fornecedor da org.
  const [{ data: card }, { data: forn }] = await Promise.all([
    admin.from("lancamento_cards").select("id").eq("id", id).eq("org_id", appUser.org_id).maybeSingle(),
    admin.from("fornecedores").select("id").eq("id", fornecedorId).eq("org_id", appUser.org_id).maybeSingle(),
  ])
  if (!card || !forn) return NextResponse.json({ error: "Cartão ou fornecedor não encontrado" }, { status: 404 })

  const { error } = await admin
    .from("lancamento_card_fornecedores")
    .upsert({ org_id: appUser.org_id, card_id: id, fornecedor_id: fornecedorId }, { onConflict: "card_id,fornecedor_id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
