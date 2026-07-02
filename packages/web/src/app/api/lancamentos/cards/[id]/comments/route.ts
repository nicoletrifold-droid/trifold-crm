import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// GET (listar) / POST (adicionar) comentários de um cartão — a "discussão". Story Lançamentos-03.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("lancamento_card_comments")
    .select("id, body, created_at, user:users!user_id(name)")
    .eq("card_id", id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comments = ((data ?? []) as Array<{ id: string; body: string; created_at: string; user: { name: string | null } | { name: string | null }[] | null }>).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    author: (Array.isArray(c.user) ? c.user[0]?.name : c.user?.name) ?? "Usuário",
  }))
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { body?: string } | null
  const text = body?.body?.trim()
  if (!text) return NextResponse.json({ error: "Comentário vazio" }, { status: 400 })

  const { data: card } = await admin
    .from("lancamento_cards")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 })

  const { data, error } = await admin
    .from("lancamento_card_comments")
    .insert({ org_id: appUser.org_id, card_id: id, user_id: appUser.id, body: text })
    .select("id, body, created_at")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comment: { ...data, author: appUser.name ?? "Você" } })
}
