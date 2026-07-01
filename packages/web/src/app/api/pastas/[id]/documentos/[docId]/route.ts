import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { isPastaManager } from "@web/lib/pastas/roles"

const VALID_SITUACOES = ["pendente", "entregue", "deferido", "recusado"]

// PATCH — marca a situação de um documento (deferido/recusado/…). PROVISÓRIO até o
// perfil revisor dedicado existir (Story 75-104, decisão 3): por ora admin/supervisor.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!isPastaManager(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, docId } = await params
  const body = await request.json().catch(() => ({}))
  const situacao = body.situacao

  if (!VALID_SITUACOES.includes(situacao)) {
    return NextResponse.json({ error: "Situação inválida" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("pasta_documentos")
    .update({ situacao })
    .eq("id", docId)
    .eq("pasta_id", id)
    .select("id, situacao")
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Documento não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ data })
}
