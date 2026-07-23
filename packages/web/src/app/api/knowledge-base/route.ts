import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { generateEmbeddingStrict } from "@trifold/ai"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "gerente-comercial"])
  if (roleError) return roleError

  const { searchParams } = request.nextUrl
  const sourceId = searchParams.get("source_id")
  const source = searchParams.get("source")

  let query = supabase
    .from("knowledge_base")
    .select("*")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (sourceId) {
    query = query.eq("source_id", sourceId)
  }

  if (source) {
    query = query.eq("source", source)
  }

  const { data: entries, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: entries })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor", "gerente-comercial"])
  if (roleError) return roleError

  let body: Record<string, unknown>
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    body = await request.json()
  } else {
    const formData = await request.formData()
    body = Object.fromEntries(formData.entries())
  }

  if (!(body.title as string | undefined)?.trim()) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    )
  }

  if (!(body.content as string | undefined)?.trim()) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    )
  }

  const title = (body.title as string).trim()
  const content = (body.content as string).trim()

  // Entrada sem embedding é INVISÍVEL para a Nicole (match_knowledge exige
  // NOT NULL — gotcha 75-173). Gera na gravação; se a OpenAI falhar, melhor
  // recusar com erro claro do que salvar conhecimento que nunca será usado.
  let embedding: number[]
  try {
    embedding = await generateEmbeddingStrict(`${title}\n\n${content}`)
  } catch (err) {
    console.error("[KNOWLEDGE_BASE] embedding failed on create:", err)
    return NextResponse.json(
      { error: "Não foi possível indexar o conteúdo agora (embedding). Tente novamente em instantes." },
      { status: 502 }
    )
  }

  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .insert({
      org_id: appUser.org_id,
      title,
      content,
      embedding: JSON.stringify(embedding),
      source: (body.source as string | undefined)?.trim() || null,
      source_id: (body.source_id as string | undefined) || null,
      metadata: body.metadata || null,
    })
    .select("id, org_id, title, content, source, source_id, metadata, is_active, created_at, updated_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(
      new URL("/dashboard/configuracoes/nicole/treinamento", request.url),
      { status: 303 }
    )
  }

  return NextResponse.json({ data: entry }, { status: 201 })
}
