import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import type { SupabaseClient } from "@supabase/supabase-js"

const ALLOWED_ROLES = ["admin", "supervisor"]

async function assertClienteOwnership(
  supabase: SupabaseClient,
  clienteId: string,
  orgId: string
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", clienteId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 }
    )
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; vinculo_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id, vinculo_id } = await params

  const ownershipError = await assertClienteOwnership(
    supabase,
    id,
    appUser.org_id
  )
  if (ownershipError) return ownershipError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (body.numero_unidade === undefined) {
    return NextResponse.json(
      { error: "Nenhum campo para atualizar" },
      { status: 400 }
    )
  }

  const numeroUnidade =
    typeof body.numero_unidade === "string" && body.numero_unidade.trim()
      ? body.numero_unidade.trim()
      : null

  const { data, error } = await supabase
    .from("clientes_obras_vinculos")
    .update({ numero_unidade: numeroUnidade })
    .eq("id", vinculo_id)
    .eq("cliente_id", id)
    .select("id, obra_id, numero_unidade, created_at")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json(
      { error: "Vínculo não encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; vinculo_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  const { id, vinculo_id } = await params

  const ownershipError = await assertClienteOwnership(
    supabase,
    id,
    appUser.org_id
  )
  if (ownershipError) return ownershipError

  const { error } = await supabase
    .from("clientes_obras_vinculos")
    .delete()
    .eq("id", vinculo_id)
    .eq("cliente_id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
