import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { buildUpdatePayload, softDelete } from "@web/lib/api-utils"
import { generateEmbeddingStrict } from "@trifold/ai"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // admin/supervisor/gerente-comercial podem editar — mas website só admin
  const roleError = await requireCapability(appUser, "nicole.treinamento_gerenciar")
  if (roleError) return roleError

  // Fetch current entry to check source (title/content p/ re-embedar em edição parcial)
  const { data: current } = await supabase
    .from("knowledge_base")
    .select("source, title, content")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!current) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  }

  // Entradas de website: somente admin pode editar
  if (current.source === "website" && appUser.role !== "admin") {
    return NextResponse.json(
      { error: "Entradas de website só podem ser editadas por admin." },
      { status: 403 }
    )
  }

  const body = await request.json()

  const { fields: updateFields, error: payloadError } = buildUpdatePayload(body, [
    "title",
    "content",
    "source",
    "source_id",
    "metadata",
  ])

  if (payloadError) return payloadError

  // Texto mudou → embedding precisa acompanhar, senão a busca segue achando o
  // conteúdo ANTIGO (gotcha 75-173: embedding é o que a Nicole enxerga).
  if ("title" in updateFields || "content" in updateFields) {
    const newTitle = ((updateFields.title as string | undefined) ?? current.title ?? "").trim()
    const newContent = ((updateFields.content as string | undefined) ?? current.content ?? "").trim()
    try {
      updateFields.embedding = JSON.stringify(await generateEmbeddingStrict(`${newTitle}\n\n${newContent}`))
    } catch (err) {
      console.error("[KNOWLEDGE_BASE] embedding failed on update:", err)
      return NextResponse.json(
        { error: "Não foi possível reindexar o conteúdo agora (embedding). Tente novamente em instantes." },
        { status: 502 }
      )
    }
  }

  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .update(updateFields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select("id, org_id, title, content, source, source_id, metadata, is_active, created_at, updated_at")
    .single()

  if (error || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  }

  return NextResponse.json({ data: entry })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser, supabase } = auth

  // Exclusão: somente admin
  const roleError = await requireCapability(appUser, "nicole.treinamento_apagar")
  if (roleError) return roleError

  const result = await softDelete(supabase, "knowledge_base", id, appUser.org_id)
  if (result.error) return result.error

  return NextResponse.json({ data: { message: "Entry deleted" } })
}
