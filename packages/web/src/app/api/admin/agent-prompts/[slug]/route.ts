import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { validateChangeReason, validatePromptContent } from "@web/lib/agent-prompts"

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

  const roleError = await requireCapability(appUser, "nicole.personalidade_editar")
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
 *
 * Story 87-1 · AC2 — passa a EXIGIR `motivo` e a responder 400 sem ele. Esta rota é a
 * superfície nº 2 (uso programático/integrações); o painel não passa por aqui, ele usa a
 * server action de `configuracoes/personalidade/actions.ts`. As duas compartilham as
 * mesmas validações (`@web/lib/agent-prompts`) para não divergirem com o tempo.
 * O `motivo` vai para `last_change_reason` no MESMO update, e o trigger
 * `agent_prompts_versionar` (migration 219) o copia para o histórico.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "nicole.personalidade_editar")
  if (roleError) return roleError

  const { slug } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const payload = body as { content?: unknown; motivo?: unknown } | null

  const conteudo = validatePromptContent(payload?.content)
  if (!conteudo.ok) {
    return NextResponse.json({ error: conteudo.error }, { status: 400 })
  }

  const motivo = validateChangeReason(payload?.motivo)
  if (!motivo.ok) {
    return NextResponse.json({ error: motivo.error }, { status: 400 })
  }

  const { data: prompt, error } = await supabase
    .from("agent_prompts")
    .update({ content: conteudo.value, last_change_reason: motivo.value })
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
