import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import {
  canTransitionMarketingPost,
  isMarketingPostEditable,
  validateMarketingPostInput,
} from "@web/lib/marketing/posts"

const POST_SELECT =
  "id, org_id, empreendimento_id, canal, copy, arte_url, scheduled_for, status, justificativa, origem, created_by, created_at, updated_at, properties:empreendimento_id(name)"

// PATCH /api/marketing-posts/[id] — edição de conteúdo (copy/arte_url/
// scheduled_for em sugerido/aprovado) e/ou transição de status validada
// server-side: sugerido→aprovado|rejeitado; aprovado→publicado; rejeitado e
// publicado são terminais. Rejeitar NUNCA é DELETE (AC4/AC7).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 })
  }

  // Estado atual — as transições dependem do status vigente no banco.
  const { data: current, error: fetchError } = await admin
    .from("marketing_posts")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 })

  const update: Record<string, unknown> = {}

  // Transição de status (opcional no PATCH)
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !canTransitionMarketingPost(current.status, body.status)) {
      return NextResponse.json(
        { error: `Transição de status inválida: ${current.status} → ${String(body.status)}` },
        { status: 422 }
      )
    }
    update.status = body.status
  }

  // Edição de conteúdo (opcional no PATCH) — só em sugerido/aprovado.
  const contentFields: Record<string, unknown> = { ...body }
  delete contentFields.status
  if (Object.keys(contentFields).length > 0) {
    if (!isMarketingPostEditable(current.status)) {
      return NextResponse.json(
        { error: `Post ${current.status} não pode ser editado` },
        { status: 422 }
      )
    }
    const parsed = validateMarketingPostInput(contentFields, { partial: true })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    Object.assign(update, parsed.value)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from("marketing_posts")
    .update(update)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select(POST_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
