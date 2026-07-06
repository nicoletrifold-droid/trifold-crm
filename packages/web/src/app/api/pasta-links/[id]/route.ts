import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { isPastaManager } from "@web/lib/pastas/roles"

// Story 75-146 — PATCH /api/pasta-links/[id]: revoga (ativo=false) ou reativa (ativo=true)
// um link de auto-cadastro. Gate: isPastaManager; RLS org-scoped garante que só links da
// própria org são alcançados (o update por id + a policy do session client bastam).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!isPastaManager(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (typeof body.ativo !== "boolean") {
    return NextResponse.json({ error: "ativo (boolean) é obrigatório" }, { status: 400 })
  }

  const { data: link, error } = await supabase
    .from("pasta_links")
    .update({ ativo: body.ativo })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select("id, ativo")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!link) {
    return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ data: { id: link.id, ativo: link.ativo } })
}
