import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import {
  MARKETING_POST_STATUSES,
  validateMarketingPostInput,
} from "@web/lib/marketing/posts"

// Story 75-219 — marketing_posts tem RLS SEM policies: TODAS as operações na
// tabela passam pelo admin client, com org_id sempre explícito (tabela
// multi-org sem trigger que preencha).

const POST_SELECT =
  "id, org_id, empreendimento_id, canal, formato, pedido, copy, roteiro, arte_url, scheduled_for, status, justificativa, origem, created_by, created_at, updated_at, properties:empreendimento_id(name)"

// GET /api/marketing-posts?status= — listagem por área da aba Agente.
export async function GET(req: NextRequest) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const status = req.nextUrl.searchParams.get("status")
  if (status && !(MARKETING_POST_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 })
  }

  let query = admin
    .from("marketing_posts")
    .select(POST_SELECT)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [] })
}

// POST /api/marketing-posts — cadastro manual ("+ Novo post"): entra na mesma
// fila de aprovação com origem='humano' e status='sugerido' (AC5).
export async function POST(req: NextRequest) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const parsed = validateMarketingPostInput(await req.json().catch(() => null), {
    partial: false,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from("marketing_posts")
    .insert({
      ...parsed.value,
      org_id: appUser.org_id,
      status: "sugerido",
      origem: "humano",
      created_by: appUser.id,
    })
    .select(POST_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
