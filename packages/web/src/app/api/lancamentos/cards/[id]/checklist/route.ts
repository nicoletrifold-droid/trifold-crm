import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// GET (listar) / POST (adicionar) itens de checklist de um cartão. Story Lançamentos-05.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("lancamento_card_checklist")
    .select("id, text, done, position")
    .eq("card_id", id)
    .eq("org_id", appUser.org_id)
    .order("position", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { text?: string } | null
  const text = body?.text?.trim()
  if (!text) return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 })

  const { data: card } = await admin
    .from("lancamento_cards").select("id").eq("id", id).eq("org_id", appUser.org_id).maybeSingle()
  if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 })

  const { data: last } = await admin
    .from("lancamento_card_checklist")
    .select("position").eq("card_id", id).order("position", { ascending: false }).limit(1).maybeSingle()
  const position = ((last?.position as number | undefined) ?? -1) + 1

  const { data, error } = await admin
    .from("lancamento_card_checklist")
    .insert({ org_id: appUser.org_id, card_id: id, text, position })
    .select("id, text, done, position")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
