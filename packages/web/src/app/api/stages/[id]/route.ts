import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { buildUpdatePayload, softDelete } from "@web/lib/api-utils"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "configuracoes.pipeline_editar")
  if (forbidden) return forbidden

  const body = await request.json()

  const allowedFields = ["name", "slug", "type", "position", "color", "is_default"]
  const { fields, error: payloadError } = buildUpdatePayload(body, allowedFields)
  if (payloadError) return payloadError

  // 75-371 (@qa QA-75-371-5) — DESMARCAR a etapa padrão é recusado, pelo mesmo motivo
  // que excluí-la: a org ficaria sem padrão e `getDefaultStageId` cairia no fallback
  // "primeira etapa por posição", silenciosamente. Marcar OUTRA etapa como padrão é o
  // caminho: o trigger da migration 250 transfere o posto na mesma transação.
  if (fields.is_default === false) {
    const { data: atual, error: erroDeLeitura } = await supabase
      .from("kanban_stages")
      .select("is_default")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .maybeSingle()

    if (erroDeLeitura) {
      console.error("[PATCH /api/stages/:id] leitura da guarda falhou:", erroDeLeitura.message)
      return NextResponse.json(
        { error: "Não foi possível verificar se esta é a etapa padrão. Tente novamente." },
        { status: 500 }
      )
    }

    if (atual?.is_default) {
      return NextResponse.json(
        {
          error:
            "Toda org precisa de uma etapa padrão. Marque outra etapa como padrão — o posto é transferido automaticamente.",
        },
        { status: 409 }
      )
    }
  }

  console.log("[PATCH /api/stages/:id]", { id, org_id: appUser.org_id, fields })

  const { data: stage, error } = await supabase
    .from("kanban_stages")
    .update(fields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error) {
    console.error("[PATCH /api/stages/:id] DB error:", JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!stage) {
    const { data: check } = await supabase
      .from("kanban_stages")
      .select("id, org_id, is_active")
      .eq("id", id)
      .maybeSingle()
    console.error("[PATCH /api/stages/:id] not found. Stage in DB:", JSON.stringify(check))
    return NextResponse.json({ error: "Stage not found" }, { status: 404 })
  }

  return NextResponse.json({ data: stage })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = await requireCapability(appUser, "configuracoes.pipeline_editar")
  if (forbidden) return forbidden

  // 75-371 — a etapa padrão não pode ser excluída. O DELETE é soft
  // (`is_active = false`) e `getDefaultStageId` NÃO filtra `is_active`: excluir a
  // padrão deixaria `is_default = true` numa etapa inativa e todo lead novo passaria
  // a nascer numa etapa que o Pipeline e os filtros não mostram.
  const { data: alvo, error: erroDeLeitura } = await supabase
    .from("kanban_stages")
    .select("is_default")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .maybeSingle()

  // Falha FECHADA (@qa QA-75-371-6): se não deu para saber se é a padrão, não exclui.
  // Descartar o erro e seguir no `alvo?.is_default` de um `null` deixava passar
  // justamente no caso em que a guarda mais importa.
  if (erroDeLeitura) {
    console.error("[DELETE /api/stages/:id] leitura da guarda falhou:", erroDeLeitura.message)
    return NextResponse.json(
      { error: "Não foi possível verificar se esta é a etapa padrão. Tente novamente." },
      { status: 500 }
    )
  }

  if (alvo?.is_default) {
    return NextResponse.json(
      {
        error:
          "Esta é a etapa padrão, onde todo lead novo entra. Eleja outra etapa como padrão antes de excluir esta.",
      },
      { status: 409 }
    )
  }

  const result = await softDelete(supabase, "kanban_stages", id, appUser.org_id)
  if (result.error) return result.error

  return NextResponse.json({ data: { message: "Stage deleted" } })
}
