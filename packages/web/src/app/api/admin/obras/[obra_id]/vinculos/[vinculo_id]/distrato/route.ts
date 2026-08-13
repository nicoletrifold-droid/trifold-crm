import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"


/**
 * Story 20.9 (AC 10/11) — Reversão manual da flag `distrato` de um vínculo.
 * Apenas atualiza o boolean (reversível); não deleta nem cria nenhuma linha em
 * clientes_obras_vinculos / cliente_obras / clientes / users. Restrito a `admin`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; vinculo_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "obras.distrato")
  if (roleError) return roleError

  const { obra_id, vinculo_id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const distrato = (body as { distrato?: unknown })?.distrato
  if (typeof distrato !== "boolean") {
    return NextResponse.json(
      { error: "Campo 'distrato' (boolean) é obrigatório" },
      { status: 400 }
    )
  }

  // Valida que a obra pertence à org do admin antes de tocar o vínculo.
  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 })
  }

  // Atualiza apenas a flag; escopo restrito a id + obra_id para evitar
  // atualização cruzada entre obras. Usa admin client (RLS protege a tabela).
  const admin = createAdminClient()
  const { data: updated, error: updErr } = await admin
    .from("clientes_obras_vinculos")
    .update({ distrato })
    .eq("id", vinculo_id)
    .eq("obra_id", obra_id)
    .select("id")
    .maybeSingle()

  if (updErr) {
    console.error(
      "[admin/obras/vinculos/distrato] erro:",
      updErr.message
    )
    return NextResponse.json(
      { error: "Erro ao atualizar vínculo" },
      { status: 500 }
    )
  }

  if (!updated) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ success: true, distrato })
}
