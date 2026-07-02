import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"
import { LABEL_COLORS } from "@web/lib/lancamentos/lancamentos"

// PATCH (título/descrição/etiquetas/prazo/responsável) / DELETE de um cartão.
// Story Lançamentos-03 (base) + 04 (cartão rico).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as {
    title?: string
    description?: string
    due_date?: string | null
    assignee_id?: string | null
    labels?: string[]
  } | null
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === "string") {
    const t = body.title.trim()
    if (!t) return NextResponse.json({ error: "Título não pode ser vazio" }, { status: 400 })
    patch.title = t
  }
  if (typeof body.description === "string") patch.description = body.description
  // Story 04: prazo (ISO ou null), responsável (uuid ou null), etiquetas (subset da paleta fixa).
  if ("due_date" in body) patch.due_date = body.due_date ? body.due_date : null
  if ("assignee_id" in body) patch.assignee_id = body.assignee_id ? body.assignee_id : null
  if (Array.isArray(body.labels)) {
    patch.labels = body.labels.filter((c) => (LABEL_COLORS as readonly string[]).includes(c))
  }

  const { error } = await admin
    .from("lancamento_cards")
    .update(patch)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { error } = await admin
    .from("lancamento_cards")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
