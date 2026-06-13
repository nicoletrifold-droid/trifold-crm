import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

const MIN_CONTENT_LENGTH = 10

/**
 * GET /api/admin/agent-prompts/[slug]
 * Retorna um prompt individual pelo slug. Admin-only (Story 53-2).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const { slug } = await params

  const { data: prompt, error } = await supabase
    .from("agent_prompts")
    .select("id, slug, name, type, content, is_active")
    .eq("org_id", appUser.org_id)
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 })
  }

  return NextResponse.json({ data: prompt })
}

/**
 * PUT /api/admin/agent-prompts/[slug]
 * Atualiza apenas o `content` de um prompt existente. Admin-only (Story 53-2).
 * Não cria nem deleta slugs (operação de seed/infra).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const { slug } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const content = (body as { content?: unknown } | null)?.content

  if (typeof content !== "string" || content.trim().length < MIN_CONTENT_LENGTH) {
    return NextResponse.json(
      {
        error: `Campo 'content' é obrigatório e deve ter ao menos ${MIN_CONTENT_LENGTH} caracteres.`,
      },
      { status: 400 }
    )
  }

  const { data: prompt, error } = await supabase
    .from("agent_prompts")
    .update({ content })
    .eq("org_id", appUser.org_id)
    .eq("slug", slug)
    .select("id, slug, name, type, content, is_active")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 })
  }

  return NextResponse.json({ data: prompt })
}
